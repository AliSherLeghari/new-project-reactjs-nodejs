import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createApp, errorHandler } from './app.js';
import { parsePort } from './config.js';

describe('HTTP API', () => {
  it('returns the health contract without caching or framework disclosure', async () => {
    const response = await request(createApp())
      .get('/api/health')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'opensource-explorer-api',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('returns a structured 404', async () => {
    const response = await request(createApp()).get('/missing').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
  it('does not expose internal errors to clients', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = express();
      app.get('/failure', () => {
        throw new Error('private diagnostic');
      });
      app.use(errorHandler);
      const response = await request(app).get('/failure').expect(500);
      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      });
    } finally {
      log.mockRestore();
    }
  });
});
describe('port configuration', () => {
  it('uses a default or an explicit valid port', () => {
    expect(parsePort(undefined)).toBe(3001);
    expect(parsePort('4000')).toBe(4000);
  });
  it.each(['', '0', '-1', '65536', '3.5', 'abc', '3001junk'])(
    'rejects %j',
    (value) => {
      expect(() => parsePort(value)).toThrow('PORT must be an integer');
    },
  );
});
