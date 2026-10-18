import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { createBoundary } from './security.js';
import { startServer } from './runtime.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'opensource-static-'));
mkdirSync(path.join(dir, 'assets'));
writeFileSync(
  path.join(dir, 'index.html'),
  '<!doctype html><html lang="en"><title>fixture</title><div id="root"></div></html>',
);
writeFileSync(
  path.join(dir, 'assets', 'app-hash.js'),
  'console.log("fixture");',
);
writeFileSync(path.join(dir, '.env'), 'PRIVATE_FIXTURE');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('production static routing and security boundary', () => {
  const app = createApp(undefined, { frontendDir: dir, production: true });
  it.each([
    '/',
    '/repositories/octocat/Hello-World',
    '/repositories/octocat/Hello-World/',
  ])('serves SPA for %s', async (url) => {
    const response = await request(app)
      .get(url)
      .accept('html')
      .expect(200)
      .expect('Content-Type', /html/);
    expect(response.text).toContain('id="root"');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    expect(response.headers['content-security-policy']).not.toContain(
      'unsafe-inline',
    );
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['x-request-id']).toMatch(/^[a-f\d-]{36}$/);
  });
  it('serves built assets with immutable cache but never dotfiles', async () => {
    const asset = await request(app).get('/assets/app-hash.js').expect(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const response = await request(app).get('/.env').expect(404);
    expect(response.text).not.toContain('PRIVATE_FIXTURE');
  });
  it.each([
    '/api/unknown',
    '/api',
    '/assets/missing.js',
    '/unknown',
    '/repositories/bad_owner/repo',
    '/repositories/owner/%ZZ',
    '/assets/%2e%2e/%2e%2e/.env',
  ])('does not return the SPA for %s', async (url) => {
    const response = await request(app).get(url).accept('html').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
  it('does not convert API requests or non-HTML deep links to HTML', async () => {
    await request(app)
      .get('/api/health')
      .accept('html')
      .expect(200)
      .expect('Content-Type', /json/);
    await request(app)
      .get('/repositories/owner/repo')
      .accept('json')
      .expect(404);
  });
  it('readiness describes assets/draining, liveness stays unchanged, neither probes GitHub', async () => {
    let ready = true;
    const app = createApp(undefined, {
      frontendDir: dir,
      isReady: () => ready,
    });
    expect((await request(app).get('/api/ready').expect(200)).body.status).toBe(
      'ready',
    );
    ready = false;
    expect((await request(app).get('/api/ready').expect(503)).body.status).toBe(
      'not_ready',
    );
    await request(app).get('/api/health').expect(200);
    await request(createApp(undefined, { frontendDir: '/missing/frontend' }))
      .get('/api/ready')
      .expect(503);
  });
  it('rejects oversized requests and API request bodies/methods', async () => {
    await request(app).get('/api/health').send('x'.repeat(17_000)).expect(413);
    await request(app).get('/api/health').send('small').expect(400);
    await request(app)
      .post('/api/health')
      .send({})
      .expect(405)
      .expect('Allow', 'GET, HEAD');
    await request(app)
      .get('/api/health?q=' + 'x'.repeat(4100))
      .expect(414);
    await request(app).head('/api/health').expect(200);
  });
  it('limits API traffic with bounded expiring state and ignores spoofed forwarded addresses', async () => {
    let now = 0;
    const app = createApp(undefined, {
      rateLimit: { maxRequests: 1, windowMs: 1000, now: () => now },
    });
    await request(app)
      .get('/api/nope')
      .set('X-Forwarded-For', '10.0.0.1')
      .expect(404);
    await request(app)
      .get('/api/nope')
      .set('X-Forwarded-For', '10.0.0.2')
      .expect(429)
      .expect('Retry-After', '1');
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/ready').expect(200);
    now = 1000;
    await request(app).get('/api/nope').expect(404);
  });
  it('rejects invalid limiter settings', () =>
    expect(() => createBoundary({ rateLimit: { maxRequests: 0 } })).toThrow());
  it('logs only correlation/method/surface/status/timing, never IP, URL queries, or client request IDs', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const response = await request(
        createApp(undefined, { logRequests: true }),
      )
        .get('/api/unknown?private=SECRET_QUERY')
        .set('X-Request-ID', 'SECRET_ID')
        .expect(404);
      expect(response.headers['x-request-id']).not.toBe('SECRET_ID');
      const value = JSON.parse(log.mock.calls[0][0]);
      expect(Object.keys(value).sort()).toEqual([
        'duration_ms',
        'event',
        'method',
        'request_id',
        'status',
        'surface',
      ]);
      expect(JSON.stringify(value)).not.toContain('SECRET');
      expect(value.request_id).toBe(response.headers['x-request-id']);
    } finally {
      log.mockRestore();
    }
  });
});

describe('real server lifecycle', () => {
  it('requires built frontend assets for production', () => {
    expect(() => startServer({ port: 0, production: true })).toThrow();
    expect(() =>
      startServer({
        port: 0,
        production: true,
        frontendDir: '/missing/frontend',
      }),
    ).toThrow();
  });
  it('starts on the specified host/port, sets timeouts, and shuts down idempotently', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const runtime = startServer({
      port: 0,
      host: '127.0.0.1',
      production: true,
      frontendDir: dir,
      logRequests: false,
    });
    try {
      await once(runtime.server, 'listening');
      const port = (runtime.server.address() as { port: number }).port;
      expect((await fetch(`http://127.0.0.1:${port}/api/ready`)).status).toBe(
        200,
      );
      expect(runtime.server.headersTimeout).toBe(10_000);
      expect(runtime.server.requestTimeout).toBe(15_000);
      const first = runtime.shutdown('SIGTERM');
      expect(runtime.shutdown()).toBe(first);
      await first;
      expect(runtime.server.listening).toBe(false);
      await request(runtime.app).get('/api/ready').expect(503);
    } finally {
      await runtime.shutdown();
      log.mockRestore();
    }
  });
});

it('forces stalled connections closed after the graceful shutdown deadline', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const forced = vi.fn();
  const runtime = startServer({
    port: 0,
    host: '127.0.0.1',
    shutdownTimeoutMs: 25,
    onForcedExit: forced,
    logRequests: false,
  });
  // Add a stalled connection at the HTTP-server boundary without adding an application route.
  runtime.server.removeAllListeners('request');
  runtime.server.on('request', () => {});
  try {
    await once(runtime.server, 'listening');
    const port = (runtime.server.address() as { port: number }).port;
    const connected = once(runtime.server, 'request');
    const pending = fetch(`http://127.0.0.1:${port}/`).catch(() => undefined);
    await connected;
    await runtime.shutdown('SIGINT');
    await pending;
    expect(forced).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      JSON.stringify({ event: 'shutdown_timeout' }),
    );
  } finally {
    await runtime.shutdown();
    info.mockRestore();
    error.mockRestore();
  }
});
