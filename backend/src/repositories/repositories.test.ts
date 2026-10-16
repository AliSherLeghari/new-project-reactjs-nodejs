import request from 'supertest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp } from '../app.js';
import { createGithubClient, type Fetch } from '../github/client.js';
import { createRepositoryService } from './service.js';
import { TtlCache } from './cache.js';
import { parseGithubTimeout } from '../config.js';

const fixture = {
  name: 'Hello-World',
  owner: { login: 'octocat', extra: 'not exposed' },
  private: false,
  description: 'Example repository',
  language: null,
  stargazers_count: 42,
  forks_count: 8,
  open_issues_count: 3,
  html_url: 'https://github.com/octocat/Hello-World',
  sensitive_extra: 'must not leak',
};
const normalized = {
  name: 'Hello-World',
  owner: 'octocat',
  description: 'Example repository',
  language: null,
  stars: 42,
  forks: 8,
  open_issues: 3,
  url: 'https://github.com/octocat/Hello-World',
};
function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), { status, headers });
}
function setup(
  fetcher = vi
    .fn<Fetch>()
    .mockImplementation(async () =>
      json({ total_count: 1, incomplete_results: false, items: [fixture] }),
    ),
  options: {
    ttlMs?: number;
    maxEntries?: number;
    now?: () => number;
    timeoutMs?: number;
  } = {},
) {
  const client = createGithubClient({ fetch: fetcher, ...options });
  const service = createRepositoryService(client, options);
  return { app: createApp(service), fetcher, client };
}
afterEach(() => vi.useRealTimers());

describe('search contract and normalization', () => {
  it('constructs an encoded public query with defaults and fixed token-free headers', async () => {
    const { app, fetcher } = setup();
    const response = await request(app)
      .get('/api/repositories')
      .query({ q: '  hello   world & tools  ', language: 'C++' })
      .expect(200);
    expect(response.body).toEqual({
      repositories: [normalized],
      pagination: {
        page: 1,
        per_page: 20,
        total_count: 1,
        accessible_pages: 1,
        has_next_page: false,
        search_limit: 1000,
        truncated: false,
        incomplete_results: false,
      },
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    const target = url as URL;
    expect(target.origin).toBe('https://api.github.com');
    expect(target.searchParams.get('q')).toBe(
      'hello world & tools is:public language:"c++"',
    );
    expect(target.searchParams.has('sort')).toBe(false);
    expect(target.searchParams.get('per_page')).toBe('20');
    expect(options?.headers).toEqual({
      'User-Agent': 'OpenSource-Explorer',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
    expect(options?.redirect).toBe('error');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('returns a useful empty result', async () => {
    const { app } = setup(
      vi
        .fn<Fetch>()
        .mockResolvedValue(
          json({ total_count: 0, incomplete_results: false, items: [] }),
        ),
    );
    const { body } = await request(app)
      .get('/api/repositories?q=unlikely')
      .expect(200);
    expect(body.repositories).toEqual([]);
    expect(body.pagination).toMatchObject({
      total_count: 0,
      accessible_pages: 0,
      has_next_page: false,
    });
  });
  it('normalizes sort/order/page and caps per_page to 50', async () => {
    const { app, fetcher } = setup();
    const { body } = await request(app)
      .get(
        '/api/repositories?q=react&sort=stars&order=asc&page=02&per_page=100',
      )
      .expect(200);
    const url = fetcher.mock.calls[0][0] as URL;
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      sort: 'stars',
      order: 'asc',
      page: '2',
      per_page: '50',
    });
    expect(body.pagination).toMatchObject({ page: 2, per_page: 50 });
  });
  it('reports GitHub truncation and incomplete results without advertising inaccessible pages', async () => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(
        json({
          total_count: 2000,
          incomplete_results: true,
          items: Array(30).fill(fixture),
        }),
      ),
    );
    const { body } = await request(app)
      .get('/api/repositories?q=react&per_page=30&page=33')
      .expect(200);
    expect(body.pagination).toEqual({
      page: 33,
      per_page: 30,
      total_count: 2000,
      accessible_pages: 33,
      has_next_page: false,
      search_limit: 1000,
      truncated: true,
      incomplete_results: true,
    });
  });
  it('allows the next page only within the result window and when the page is full', async () => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(
        json({
          total_count: 25,
          incomplete_results: false,
          items: Array(20).fill(fixture),
        }),
      ),
    );
    const { body } = await request(app)
      .get('/api/repositories?q=react')
      .expect(200);
    expect(body.pagination).toMatchObject({
      accessible_pages: 2,
      has_next_page: true,
    });
  });
  it.each([
    '',
    '?q=',
    '?q=%20',
    '?q=x&q=y',
    '?q[x]=y',
    '?q=x&wat=1',
    '?q=x&sort=bad',
    '?q=x&order=bad',
    '?q=x&page=0',
    '?q=x&page=-1',
    '?q=x&page=1.5',
    '?q=x&page=abc',
    '?q=x&per_page=0',
    '?q=x&per_page=1e2',
    '?q=x&per_page=9007199254740992',
    '?q=x&page=51',
    '?q=x&per_page=30&page=34',
    '?q=x&language=',
    '?q=x&language=%22OR%22',
    '?q=x&language=a&language=b',
    '?q=owner%3Aoctocat',
    '?q=hi%0D%0AX-Test%3Ax',
    `?q=${'a'.repeat(201)}`,
    `?q=x&language=${'a'.repeat(51)}`,
  ])('rejects invalid search %s without calling GitHub', async (query) => {
    const { app, fetcher } = setup();
    const { body } = await request(app)
      .get(`/api/repositories${query}`)
      .expect(400);
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('repository details', () => {
  it('validates and normalizes path segments and exposes only public contract fields', async () => {
    const { app, fetcher } = setup(
      vi.fn<Fetch>().mockResolvedValue(json(fixture)),
    );
    const { body } = await request(app)
      .get('/api/repositories/Octocat/Hello-World')
      .expect(200);
    expect(body).toEqual({ repository: normalized });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://api.github.com/repos/octocat/hello-world',
    );
  });
  it.each([
    'bad_owner/repo',
    '-owner/repo',
    'owner--name/repo',
    'owner/repo%2Fescape',
    'owner/repo%20name',
    'owner/%ZZ',
    `${'a'.repeat(40)}/repo`,
    `owner/${'r'.repeat(101)}`,
  ])('rejects invalid path %s', async (path) => {
    const { app, fetcher } = setup();
    await request(app).get(`/api/repositories/${path}`).expect(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns structured 404 for a missing path segment', async () => {
    const { app, fetcher } = setup();
    await request(app).get('/api/repositories/octocat').expect(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('upstream error mapping and retry guidance', () => {
  it.each([
    [404, 404, 'REPOSITORY_NOT_FOUND'],
    [422, 400, 'SEARCH_REJECTED'],
    [401, 502, 'GITHUB_ERROR'],
    [403, 503, 'GITHUB_UNAVAILABLE'],
    [500, 502, 'GITHUB_ERROR'],
    [502, 502, 'GITHUB_ERROR'],
    [503, 503, 'GITHUB_UNAVAILABLE'],
  ])('maps upstream %i to %i', async (upstream, status, code) => {
    const { app } = setup(
      vi
        .fn<Fetch>()
        .mockResolvedValue(
          json({ message: 'private diagnostic' }, upstream as number),
        ),
    );
    const { body } = await request(app)
      .get('/api/repositories/octocat/missing')
      .expect(status as number);
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain('private diagnostic');
  });
  it('maps an exhausted primary quota to 429 with numeric metadata', async () => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(
        json({}, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1120',
        }),
      ),
      { now: () => 1_000_000 },
    );
    const { body, headers } = await request(app)
      .get('/api/repositories?q=react')
      .expect(429);
    expect(body.error).toMatchObject({
      code: 'RATE_LIMITED',
      retry_after_seconds: 120,
      rate_limit_reset: 1120,
    });
    expect(headers['retry-after']).toBe('120');
  });
  it('respects secondary-limit Retry-After even when primary quota remains', async () => {
    const { app } = setup(
      vi
        .fn<Fetch>()
        .mockResolvedValue(
          json({}, 403, { 'x-ratelimit-remaining': '25', 'retry-after': '75' }),
        ),
    );
    const response = await request(app)
      .get('/api/repositories?q=react')
      .expect(429);
    expect(response.headers['retry-after']).toBe('75');
  });
  it('normalizes HTTP-date Retry-After', async () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const { app } = setup(
      vi
        .fn<Fetch>()
        .mockResolvedValue(
          json({}, 429, { 'retry-after': 'Fri, 16 Oct 2026 12:02:00 GMT' }),
        ),
      { now: () => now },
    );
    const response = await request(app)
      .get('/api/repositories?q=x')
      .expect(429);
    expect(response.headers['retry-after']).toBe('120');
  });
  it.each([
    ['garbage', '60'],
    ['0', '1'],
    ['999999999', '86400'],
  ])('sanitizes retry %s', async (retry, expected) => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(
        json({}, 429, {
          'retry-after': retry,
          'x-ratelimit-reset': 'not-a-number',
        }),
      ),
    );
    const { body, headers } = await request(app)
      .get('/api/repositories?q=x')
      .expect(429);
    expect(headers['retry-after']).toBe(expected);
    expect(body.error.rate_limit_reset).toBeUndefined();
  });
  it('maps a network failure to 502 without leaking its message or retrying', async () => {
    const { app, fetcher } = setup(
      vi.fn<Fetch>().mockRejectedValue(new Error('secret proxy internals')),
    );
    const { body } = await request(app)
      .get('/api/repositories?q=x')
      .expect(502);
    expect(body.error.code).toBe('GITHUB_NETWORK_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('maps a slow request to 504 and aborts it', async () => {
    const fetcher = vi
      .fn<Fetch>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
    const { app } = setup(fetcher, { timeoutMs: 100 });
    const { body } = await request(app)
      .get('/api/repositories?q=x')
      .expect(504);
    expect(body.error.code).toBe('GITHUB_TIMEOUT');
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps the timeout active while consuming a slow JSON body', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<Fetch>().mockImplementation(
      async (_url, options) =>
        new Response(
          new ReadableStream({
            start(controller) {
              options?.signal?.addEventListener('abort', () =>
                controller.error(new Error('aborted')),
              );
            },
          }),
        ),
    );
    const { client } = setup(fetcher, { timeoutMs: 100 });
    const assertion = expect(
      client.get(new URL('https://api.github.com/search/repositories?q=x')),
    ).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});

describe('upstream data contracts', () => {
  it.each([
    'invalid JSON',
    'null',
    '{}',
    JSON.stringify({ total_count: -1, incomplete_results: false, items: [] }),
    JSON.stringify({ total_count: 1, items: [fixture] }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: [{ ...fixture, private: true }],
    }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: [{ ...fixture, html_url: 'javascript:alert(1)' }],
    }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: [
        { ...fixture, html_url: 'https://evil.example/octocat/Hello-World' },
      ],
    }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: [{ ...fixture, html_url: 'https://github.com/wrong/repo' }],
    }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: [{ ...fixture, stargazers_count: '42' }],
    }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: [{ ...fixture, description: {} }],
    }),
    JSON.stringify({
      total_count: 1,
      incomplete_results: false,
      items: Array(21).fill(fixture),
    }),
  ])('rejects malformed or unsafe upstream data %#', async (raw) => {
    const { app } = setup(vi.fn<Fetch>().mockResolvedValue(new Response(raw)));
    const { body } = await request(app)
      .get('/api/repositories?q=x')
      .expect(502);
    expect(body.error.code).toBe('INVALID_UPSTREAM_RESPONSE');
  });
  it('also validates the detail contract', async () => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(json({ ...fixture, forks_count: -1 })),
    );
    await request(app).get('/api/repositories/octocat/Hello-World').expect(502);
  });
  it('rejects an unexpected internal destination before sending requests', async () => {
    const { client, fetcher } = setup();
    await expect(client.get(new URL('https://evil.example'))).rejects.toThrow(
      'Unexpected GitHub API destination',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('bounded successful-result cache', () => {
  it('reuses normalized searches until the TTL expires', async () => {
    let now = 0;
    const { app, fetcher } = setup(undefined, { ttlMs: 1000, now: () => now });
    await request(app)
      .get('/api/repositories?q=%20react%20&language=TypeScript')
      .expect(200);
    await request(app)
      .get('/api/repositories?q=react&language=typescript')
      .expect(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 1000;
    await request(app)
      .get('/api/repositories?q=react&language=typescript')
      .expect(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not collide across pagination, language, ordering, sorting, or text', async () => {
    const { app, fetcher } = setup();
    for (const query of [
      'q=x',
      'q=x&page=2',
      'q=x&per_page=10',
      'q=x&language=go',
      'q=x&sort=stars',
      'q=x&order=asc',
      'q=y',
    ])
      await request(app).get(`/api/repositories?${query}`).expect(200);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
  it('evicts oldest entries at the bound', async () => {
    const { app, fetcher } = setup(undefined, { maxEntries: 2 });
    for (const q of ['a', 'b', 'c', 'a'])
      await request(app).get(`/api/repositories?q=${q}`).expect(200);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('caches detail lookups case-insensitively', async () => {
    const { app, fetcher } = setup(
      vi.fn<Fetch>().mockImplementation(async () => json(fixture)),
    );
    await request(app).get('/api/repositories/Octocat/Hello-World').expect(200);
    await request(app).get('/api/repositories/octocat/hello-world').expect(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([429, 503, 404])(
    'does not cache upstream failure %i',
    async (status) => {
      const fetcher = vi
        .fn<Fetch>()
        .mockImplementationOnce(async () => json({}, status))
        .mockImplementationOnce(async () => json(fixture));
      const { app } = setup(fetcher);
      await request(app)
        .get('/api/repositories/octocat/hello-world')
        .expect(status);
      await request(app)
        .get('/api/repositories/octocat/hello-world')
        .expect(200);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it('does not cache invalid JSON or invalid mapped data', async () => {
    const fetcher = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(new Response('bad json'))
      .mockResolvedValueOnce(json({ ...fixture, private: true }))
      .mockResolvedValueOnce(json(fixture));
    const { app } = setup(fetcher);
    await request(app).get('/api/repositories/octocat/hello-world').expect(502);
    await request(app).get('/api/repositories/octocat/hello-world').expect(502);
    await request(app).get('/api/repositories/octocat/hello-world').expect(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('removes expired entries before evicting a live entry', () => {
    let now = 0;
    const cache = new TtlCache<string>(100, 2, () => now);
    cache.set('old', 'old');
    now = 50;
    cache.set('live', 'live');
    now = 100;
    cache.set('new', 'new');
    expect(cache.get('old')).toBeUndefined();
    expect(cache.get('live')).toBe('live');
    expect(cache.get('new')).toBe('new');
  });
  it('rejects invalid cache configuration', () => {
    expect(() => new TtlCache(0)).toThrow();
    expect(() => new TtlCache(100, 0)).toThrow();
  });
});

describe('timeout settings', () => {
  it('uses safe defaults and accepts bounded settings', () => {
    expect(parseGithubTimeout(undefined)).toBe(5000);
    expect(parseGithubTimeout('100')).toBe(100);
    expect(parseGithubTimeout('30000')).toBe(30000);
  });
  it.each(['', '99', '30001', '-1', '100.5', 'invalid'])(
    'rejects %j',
    (value) => expect(() => parseGithubTimeout(value)).toThrow(),
  );
  it('rejects invalid client timeouts', () =>
    expect(() => createGithubClient({ timeoutMs: 0 })).toThrow());
});

describe('secondary-limit and maintenance guidance', () => {
  it('recognizes a secondary-limit message without exposing it', async () => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(
        json(
          {
            message:
              'You have exceeded a secondary rate limit. private diagnostic',
          },
          403,
        ),
      ),
    );
    const { body, headers } = await request(app)
      .get('/api/repositories?q=x')
      .expect(429);
    expect(headers['retry-after']).toBe('60');
    expect(JSON.stringify(body)).not.toContain('private diagnostic');
  });
  it('keeps a malformed forbidden body a safe 503', async () => {
    const { app } = setup(
      vi
        .fn<Fetch>()
        .mockResolvedValue(new Response('not JSON', { status: 403 })),
    );
    await request(app).get('/api/repositories?q=x').expect(503);
  });
  it('propagates sanitized maintenance retry guidance', async () => {
    const { app } = setup(
      vi.fn<Fetch>().mockResolvedValue(json({}, 503, { 'retry-after': '120' })),
    );
    const response = await request(app)
      .get('/api/repositories?q=x')
      .expect(503);
    expect(response.headers['retry-after']).toBe('120');
  });
});
