import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../app.js';
import { createGithubClient, type Fetch } from '../github/client.js';
import { createRepositoryService } from './service.js';

const publicRepository = {
  name: 'repo',
  owner: { login: 'owner' },
  private: false,
  description: null,
  language: null,
  stargazers_count: 1,
  forks_count: 2,
  open_issues_count: 3,
  html_url: 'https://github.com/owner/repo',
};
const issue = {
  number: 12,
  title: 'Improve documentation',
  state: 'open',
  labels: [{ name: 'good first issue' }, { name: 'docs' }],
  html_url: 'https://github.com/owner/repo/issues/12',
};
const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
function setup(
  issues: (options?: RequestInit) => Promise<Response> = async () =>
    json([issue]),
  opts: {
    ttlMs?: number;
    now?: () => number;
    timeoutMs?: number;
    private?: boolean;
  } = {},
) {
  const fetcher = vi
    .fn<Fetch>()
    .mockImplementation(async (url, options) =>
      String(url).includes('/issues?')
        ? issues(options)
        : json({ ...publicRepository, private: opts.private ?? false }),
    );
  const client = createGithubClient({
    fetch: fetcher,
    timeoutMs: opts.timeoutMs,
  });
  return { app: createApp(createRepositoryService(client, opts)), fetcher };
}
describe('bounded contribution issue API', () => {
  it('validates public visibility, fixes query options, filters PRs and returns a small safe contract', async () => {
    const { app, fetcher } = setup(async () =>
      json([
        issue,
        { pull_request: { url: 'ignored' }, number: 13 },
        {
          ...issue,
          number: 14,
          html_url: 'https://github.com/owner/repo/issues/14',
          labels: [{ name: 'other' }],
        },
      ]),
    );
    const { body, headers } = await request(app)
      .get('/api/repositories/Owner/Repo/issues')
      .expect(200);
    expect(body).toEqual({
      issues: [
        {
          number: 12,
          title: 'Improve documentation',
          state: 'open',
          labels: ['good first issue', 'docs'],
          url: issue.html_url,
        },
      ],
      label: 'good-first-issue',
      label_name: 'good first issue',
      limit: 10,
      browse_url:
        'https://github.com/owner/repo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22',
    });
    expect(headers['cache-control']).toBe('no-store');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = fetcher.mock.calls[1][0] as URL;
    expect(url.origin).toBe('https://api.github.com');
    expect(url.pathname).toBe('/repos/owner/repo/issues');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      state: 'open',
      labels: 'good first issue',
      per_page: '10',
      page: '1',
      sort: 'updated',
      direction: 'desc',
    });
    expect(
      new Headers(fetcher.mock.calls[1][1]?.headers).has('authorization'),
    ).toBe(false);
  });
  it('maps help-wanted and supports an empty result without claiming completeness', async () => {
    const { app, fetcher } = setup(async () => json([]));
    const { body } = await request(app)
      .get('/api/repositories/owner/repo/issues?label=help-wanted')
      .expect(200);
    expect(body).toMatchObject({
      issues: [],
      label: 'help-wanted',
      label_name: 'help wanted',
      limit: 10,
    });
    expect((fetcher.mock.calls[1][0] as URL).searchParams.get('labels')).toBe(
      'help wanted',
    );
  });
  it.each([
    '?label=bug',
    '?label=',
    '?label=good-first-issue&label=help-wanted',
    '?per_page=100',
    '?label[x]=help-wanted',
    '?label=good%0Afirst',
  ])('rejects unsupported issue query %s before GitHub', async (query) => {
    const { app, fetcher } = setup();
    await request(app)
      .get(`/api/repositories/owner/repo/issues${query}`)
      .expect(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['bad_owner/repo', 'owner/repo%2fescape', 'owner/%ZZ'])(
    'rejects invalid names %s',
    async (path) => {
      const { app, fetcher } = setup();
      await request(app).get(`/api/repositories/${path}/issues`).expect(400);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('does not expose issues from a private repository even if proxy authentication could access it', async () => {
    const { app, fetcher } = setup(undefined, { private: true });
    await request(app).get('/api/repositories/owner/repo/issues').expect(502);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).not.toContain('/issues');
  });
  it.each([
    null,
    {},
    Array(11).fill(issue),
    [{ ...issue, number: 0 }],
    [{ ...issue, title: {} }],
    [{ ...issue, state: 'closed' }],
    [{ ...issue, labels: ['unexpected string'] }],
    [{ ...issue, html_url: 'javascript:alert(1)' }],
    [{ ...issue, html_url: 'https://evil.example/owner/repo/issues/12' }],
    [{ ...issue, html_url: 'https://github.com/other/repo/issues/12' }],
    [{ ...issue, html_url: 'https://github.com/owner/repo/pull/12' }],
    [
      {
        ...issue,
        html_url: 'https://user:pass@github.com/owner/repo/issues/12',
      },
    ],
  ])('rejects malformed or unsafe upstream issue data %#', async (body) => {
    const { app } = setup(async () => json(body));
    const response = await request(app)
      .get('/api/repositories/owner/repo/issues')
      .expect(502);
    expect(response.body.error.code).toBe('INVALID_UPSTREAM_RESPONSE');
  });
  it('rejects invalid JSON', async () => {
    const { app } = setup(async () => new Response('invalid JSON'));
    await request(app).get('/api/repositories/owner/repo/issues').expect(502);
  });
  it.each([
    [404, 404],
    [403, 503],
    [429, 429],
    [500, 502],
  ])(
    'maps issue HTTP %i to %i without caching errors',
    async (upstream, expected) => {
      let attempts = 0;
      const { app, fetcher } = setup(async () =>
        ++attempts === 1
          ? json({ message: 'private detail' }, upstream)
          : json([issue]),
      );
      const failure = await request(app)
        .get('/api/repositories/owner/repo/issues')
        .expect(expected);
      expect(JSON.stringify(failure.body)).not.toContain('private detail');
      await request(app).get('/api/repositories/owner/repo/issues').expect(200);
      expect(fetcher).toHaveBeenCalledTimes(3); // Public details are cached, issue failures are not.
    },
  );
  it('preserves rate guidance for an exhausted issue quota', async () => {
    const { app } = setup(async () =>
      json({}, 403, { 'x-ratelimit-remaining': '0', 'retry-after': '90' }),
    );
    const response = await request(app)
      .get('/api/repositories/owner/repo/issues')
      .expect(429);
    expect(response.headers['retry-after']).toBe('90');
  });
  it('aborts slow issue requests using the existing timeout', async () => {
    const { app } = setup(
      (options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
      { timeoutMs: 100 },
    );
    const { body } = await request(app)
      .get('/api/repositories/owner/repo/issues')
      .expect(504);
    expect(body.error.code).toBe('GITHUB_TIMEOUT');
  });
  it('reuses successful public detail/issues cache, separates labels, and expires at 60 seconds', async () => {
    let now = 0;
    const { app, fetcher } = setup(async () => json([]), { now: () => now });
    await request(app).get('/api/repositories/owner/repo/issues').expect(200);
    await request(app).get('/api/repositories/OWNER/REPO/issues').expect(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await request(app)
      .get('/api/repositories/owner/repo/issues?label=help-wanted')
      .expect(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    now = 60_000;
    await request(app).get('/api/repositories/owner/repo/issues').expect(200);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('uses the same bounded cache for issues and repository responses', async () => {
    const fetcher = vi
      .fn<Fetch>()
      .mockImplementation(async (url) =>
        String(url).includes('/issues?') ? json([]) : json(publicRepository),
      );
    const app = createApp(
      createRepositoryService(createGithubClient({ fetch: fetcher }), {
        maxEntries: 1,
      }),
    );
    await request(app).get('/api/repositories/owner/repo/issues').expect(200);
    await request(app).get('/api/repositories/owner/repo/issues').expect(200);
    expect(fetcher).toHaveBeenCalledTimes(4); // A single shared slot evicts the other resource.
  });
});
