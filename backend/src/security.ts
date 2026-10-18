import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export interface BoundaryOptions {
  production?: boolean;
  logRequests?: boolean;
  rateLimit?: {
    maxRequests?: number;
    windowMs?: number;
    maxClients?: number;
    now?: () => number;
  };
}
export function createBoundary(options: BoundaryOptions = {}): RequestHandler {
  const maxRequests = options.rateLimit?.maxRequests ?? 120;
  const windowMs = options.rateLimit?.windowMs ?? 60_000;
  const maxClients = options.rateLimit?.maxClients ?? 1000;
  const now = options.rateLimit?.now ?? Date.now;
  if (
    ![maxRequests, windowMs, maxClients].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new Error('Invalid rate limit configuration.');
  const clients = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.set({
      'X-Request-ID': requestId,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (options.production)
      res.set(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
      );
    const api = /^\/api(?:\/|$)/i.test(req.path);
    if (options.logRequests)
      res.on('finish', () =>
        console.info(
          JSON.stringify({
            event: 'request',
            request_id: requestId,
            method: req.method,
            surface: api ? 'api' : 'web',
            status: res.statusCode,
            duration_ms: Math.round(performance.now() - started),
          }),
        ),
      );
    const fail = (status: number, code: string, message: string) => {
      res.status(status).json({ error: { code, message } });
    };
    if (req.originalUrl.length > 4096) {
      fail(414, 'URI_TOO_LONG', 'Request URL is too long.');
      return;
    }
    const length = req.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length) > 16_384)) {
      fail(
        413,
        'PAYLOAD_TOO_LARGE',
        'Request body exceeds the supported limit.',
      );
      return;
    }
    if (!api) {
      next();
      return;
    }
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD');
      fail(405, 'METHOD_NOT_ALLOWED', 'This API accepts GET and HEAD only.');
      return;
    }
    if (req.headers['transfer-encoding'] || (length && Number(length) > 0)) {
      fail(
        400,
        'BODY_NOT_ALLOWED',
        'API read requests must not include a body.',
      );
      return;
    }
    if (req.path === '/api/health' || req.path === '/api/ready') {
      next();
      return;
    }
    const time = now();
    for (const [key, entry] of clients)
      if (entry.reset <= time) clients.delete(key);
    // Do not trust forwarded IP headers by default. Addresses stay only in bounded, expiring memory.
    const key = req.ip ?? 'unknown';
    let entry = clients.get(key);
    if (!entry) {
      if (clients.size >= maxClients) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        fail(
          503,
          'SERVER_BUSY',
          'Server request capacity reached. Try again later.',
        );
        return;
      }
      entry = { count: 0, reset: time + windowMs };
      clients.set(key, entry);
    }
    if (++entry.count > maxRequests) {
      res.set(
        'Retry-After',
        String(Math.max(1, Math.ceil((entry.reset - time) / 1000))),
      );
      fail(
        429,
        'REQUEST_LIMITED',
        'Too many API requests. Wait before retrying.',
      );
      return;
    }
    next();
  };
}
