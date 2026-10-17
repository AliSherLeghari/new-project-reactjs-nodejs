import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { createGithubClient } from './github/client.js';
import {
  createRepositoryService,
  type RepositoryService,
} from './repositories/service.js';

export function startServer(options: {
  port: number;
  production?: boolean;
  frontendDir?: string;
  githubTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  host?: string;
  service?: RepositoryService;
  logRequests?: boolean;
  onForcedExit?: () => void;
}) {
  if (options.production && !options.frontendDir)
    throw new Error('Production frontend directory is required.');
  if (options.frontendDir)
    accessSync(path.join(options.frontendDir, 'index.html'), constants.R_OK);
  let shuttingDown = false;
  const service =
    options.service ??
    createRepositoryService(
      createGithubClient({ timeoutMs: options.githubTimeoutMs }),
    );
  const app = createApp(service, {
    production: options.production,
    frontendDir: options.frontendDir,
    logRequests: options.logRequests ?? true,
    isReady: () => !shuttingDown,
  });
  const server = app.listen(options.port, options.host ?? '0.0.0.0', () =>
    console.info(
      JSON.stringify({
        event: 'listening',
        port: (server.address() as { port: number }).port,
        mode: options.production ? 'production' : 'development',
      }),
    ),
  );
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  server.setTimeout(20_000, (socket) => socket.destroy());
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(
      JSON.stringify({
        event: 'listen_failed',
        code: ['EADDRINUSE', 'EACCES'].includes(error.code ?? '')
          ? error.code
          : 'LISTEN_ERROR',
      }),
    );
    process.exitCode = 1;
  });
  let shutdown: Promise<void> | undefined;
  return {
    app,
    server,
    shutdown(reason = 'requested') {
      if (shutdown) return shutdown;
      shuttingDown = true;
      console.info(
        JSON.stringify({
          event: 'shutdown',
          reason: ['SIGINT', 'SIGTERM'].includes(reason) ? reason : 'requested',
        }),
      );
      shutdown = new Promise<void>((resolve) => {
        const deadline = setTimeout(() => {
          console.error(JSON.stringify({ event: 'shutdown_timeout' }));
          server.closeAllConnections();
          (options.onForcedExit ?? (() => process.exit(1)))();
        }, options.shutdownTimeoutMs ?? 10_000);
        deadline.unref();
        server.close(() => {
          clearTimeout(deadline);
          console.info(JSON.stringify({ event: 'stopped' }));
          resolve();
        });
        server.closeIdleConnections();
      });
      return shutdown;
    },
  };
}
