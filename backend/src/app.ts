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
  console.error('Request failed:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};

export function createApp(
  service: RepositoryService = createRepositoryService(createGithubClient()),
) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json({ status: 'ok', service: 'opensource-explorer-api' });
  });
  app.use('/api/repositories', createRepositoryRouter(service));
  app.use((_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  app.use(errorHandler);
  return app;
}
