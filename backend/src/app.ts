import express, { type ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('Request failed:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json({ status: 'ok', service: 'opensource-explorer-api' });
  });
  app.use((_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  app.use(errorHandler);
  return app;
}
