import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBoundary, type BoundaryOptions } from './security.js';
import { validateRepository } from './repositories/validation.js';
import express, { type ErrorRequestHandler } from 'express';
import { createGithubClient } from './github/client.js';
import { ApiError } from './repositories/errors.js';
import {
  createRepositoryService,
  type RepositoryService,
} from './repositories/service.js';
import { createRepositoryRouter } from './repositories/routes.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    if (error.retryAfterSeconds !== undefined)
      res.set('Retry-After', String(error.retryAfterSeconds));
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.retryAfterSeconds !== undefined
          ? { retry_after_seconds: error.retryAfterSeconds }
          : {}),
        ...(error.rateLimitReset !== undefined
          ? { rate_limit_reset: error.rateLimitReset }
          : {}),
      },
    });
    return;
  }
  if (error instanceof URIError) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid URL encoding.' },
    });
    return;
  }
  console.error(
    JSON.stringify({
      event: 'request_failed',
      request_id: res.locals.requestId ?? 'unavailable',
    }),
  );
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};

export function createApp(
  service: RepositoryService = createRepositoryService(createGithubClient()),
  options: BoundaryOptions & {
    frontendDir?: string;
    isReady?: () => boolean;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('trust proxy');
  app.use(createBoundary(options));
  app.get('/api/health', (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json({ status: 'ok', service: 'opensource-explorer-api' });
  });
  app.get('/api/ready', (_req, res) => {
    const ready =
      (options.isReady?.() ?? true) &&
      (!options.frontendDir ||
        existsSync(path.join(options.frontendDir, 'index.html')));
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      service: 'opensource-explorer-api',
    });
  });
  app.use('/api/repositories', createRepositoryRouter(service));
  if (options.frontendDir) {
    const frontendDir = path.resolve(options.frontendDir);
    app.use(
      express.static(frontendDir, {
        index: false,
        redirect: false,
        dotfiles: 'ignore',
        lastModified: false,
        setHeaders(res, file) {
          res.setHeader(
            'Cache-Control',
            file.startsWith(path.join(frontendDir, 'assets') + path.sep)
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          );
        },
      }),
    );
    app.get(/.*/, (req, res, next) => {
      let frontendRoute = req.path === '/';
      const match = /^\/repositories\/([^/]+)\/([^/]+)\/?$/.exec(req.path);
      if (match) {
        try {
          validateRepository(
            decodeURIComponent(match[1]),
            decodeURIComponent(match[2]),
          );
          frontendRoute = true;
        } catch {
          frontendRoute = false;
        }
      }
      if (!frontendRoute || !req.accepts('html')) {
        next();
        return;
      }
      res
        .set('Cache-Control', 'no-cache')
        .sendFile(path.join(frontendDir, 'index.html'));
    });
  }
  app.use((_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  app.use(errorHandler);
  return app;
}
