import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { parseRoute } from '../routing';
import { getIssues, getRepository } from './api';
import { detailFixture, issueFixture } from './testFixtures';
import { makeResult } from '../search/testFixtures';

const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers });
function setup(
  handler?: (url: string, options: RequestInit) => Promise<Response>,
) {
  const requests = vi.fn((url: string, options: RequestInit) => {
    if (url === '/api/health')
      return Promise.resolve(
        json({ status: 'ok', service: 'opensource-explorer-api' }),
      );
    if (handler) return handler(url, options);
    if (url.includes('/issues?'))
      return Promise.resolve(
        json(
          issueFixture(
            new URL(url, 'http://app.test').searchParams.get('label') as
              'good-first-issue' | 'help-wanted',
          ),
        ),
      );
    if (url.includes('/api/repositories?'))
      return Promise.resolve(json(makeResult()));
    return Promise.resolve(json({ repository: detailFixture }));
  });
  vi.stubGlobal('fetch', requests);
  return { requests, ...render(<App />) };
}
function go(path: string) {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
beforeEach(() => history.replaceState(null, '', '/'));

describe('detail routing and page lifecycle', () => {
  it('navigates internally from a card, preserves external links and restores submitted search with back/forward', async () => {
    const { requests } = setup();
    fireEvent.change(screen.getByLabelText('Repository or topic'), {
      target: { value: 'react' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Repository search' }));
    const details = await screen.findByRole('link', {
      name: 'View details for octocat/project-0',
    });
    expect(
      screen.getByRole('link', {
        name: 'View octocat/project-0 on GitHub (opens in a new tab)',
      }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    expect(requests.mock.calls.some(([url]) => url.includes('/issues?'))).toBe(
      false,
    );
    fireEvent.click(details);
    expect(location.pathname).toBe('/repositories/octocat/project-0');
    expect(await screen.findByText('Owner: octocat')).toBeVisible();
    expect(
      await screen.findByRole('link', { name: /Issue #42:/ }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(
      screen.getByRole('link', { name: /Browse all matching/ }),
    ).toHaveAttribute('href', issueFixture().browse_url);
    expect(screen.getByText(/not a complete list/)).toBeVisible();
    await act(async () => history.back());
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Repository explorer' }),
      ).toBeVisible(),
    );
    expect(screen.getByLabelText('Repository or topic')).toHaveValue('react');
    await act(async () => history.forward());
    expect(await screen.findByText('Owner: octocat')).toBeVisible();
    expect(
      requests.mock.calls.filter(([url]) => url.includes('/api/repositories?')),
    ).toHaveLength(1);
  });
  it('does not duplicate detail/issue requests under development StrictMode', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    const mock = vi.fn((url: string) =>
      Promise.resolve(
        json(
          url === '/api/health'
            ? { status: 'ok', service: 'opensource-explorer-api' }
            : url.includes('/issues?')
              ? issueFixture()
              : { repository: detailFixture },
        ),
      ),
    );
    vi.stubGlobal('fetch', mock);
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('link', { name: /Issue #42:/ });
    expect(
      mock.mock.calls.filter(
        ([url]) => url === '/api/repositories/octocat/project-0',
      ),
    ).toHaveLength(1);
    expect(
      mock.mock.calls.filter(([url]) => url.includes('/issues?')),
    ).toHaveLength(1);
  });
  it('supports a direct URL and remount at that URL (refresh lifecycle)', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    const view = setup();
    expect(await screen.findByText('Owner: octocat')).toBeVisible();
    view.unmount();
    setup();
    expect(await screen.findByText('Owner: octocat')).toBeVisible();
    expect(document.title).toContain('octocat/project-0');
  });
  it.each([
    '/wrong',
    '/repositories/bad_owner/repo',
    '/repositories/owner/repo%2Fescape',
    '/repositories/owner/%ZZ',
  ])(
    'handles malformed/unknown route %s without calling a detail API',
    async (path) => {
      history.replaceState(null, '', path);
      const { requests } = setup();
      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeVisible();
      expect(requests.mock.calls.every(([url]) => url === '/api/health')).toBe(
        true,
      );
      expect(parseRoute(path).kind).toBe('missing');
      await screen.findAllByText('Backend connected');
    },
  );
  it('shows loading, missing fields, all metrics, and safe detail links', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    let release!: (response: Response) => void;
    setup(async (url) =>
      url.includes('/issues?')
        ? json(issueFixture())
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    expect(screen.getByText('Loading repository details…')).toBeVisible();
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () =>
      release(
        json({
          repository: { ...detailFixture, description: null, language: null },
        }),
      ),
    );
    expect(await screen.findByText('No description provided.')).toBeVisible();
    expect(screen.getByText('Language not specified')).toBeVisible();
    expect(screen.getByText('Open issues & PRs')).toBeVisible();
    expect(screen.getByText('1,250')).toBeVisible();
  });
  it('switches only the issue filter, exposes constructive empty state, and never refetches details for a label change', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    const { requests } = setup(async (url) =>
      url.includes('/issues?')
        ? json(
            url.includes('help-wanted')
              ? { ...issueFixture('help-wanted'), issues: [] }
              : issueFixture(),
          )
        : json({ repository: detailFixture }),
    );
    await screen.findByRole('link', { name: /Issue #42:/ });
    fireEvent.change(screen.getByLabelText('Contribution label'), {
      target: { value: 'help-wanted' },
    });
    expect(await screen.findByText(/No open “help wanted”/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Browse all matching/ }),
    ).toHaveAttribute('href', issueFixture('help-wanted').browse_url);
    expect(
      requests.mock.calls.filter(
        ([url]) => url === '/api/repositories/octocat/project-0',
      ),
    ).toHaveLength(1);
  });
});

describe('detail errors, cancellation, and cooldown', () => {
  it.each([
    [404, 'Public repository not found'],
    [502, 'temporarily unavailable'],
    [503, 'temporarily unavailable'],
    [504, 'too long'],
  ])(
    'renders safe HTTP %i and allows explicit retry',
    async (code, message) => {
      history.replaceState(null, '', '/repositories/octocat/project-0');
      let failed = false;
      setup(async (url) => {
        if (url.includes('/issues?')) return json(issueFixture());
        if (!failed) {
          failed = true;
          return json({ message: 'private diagnostic' }, code as number);
        }
        return json({ repository: detailFixture });
      });
      expect(
        await screen.findByText(new RegExp(message as string)),
      ).toBeVisible();
      expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
      expect(await screen.findByText('Owner: octocat')).toBeVisible();
    },
  );
  it('shows an issue failure separately from successful repository details and retries only issues', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    let count = 0;
    const { requests } = setup(async (url) =>
      url.includes('/issues?')
        ? ++count === 1
          ? json({}, 502)
          : json(issueFixture())
        : json({ repository: detailFixture }),
    );
    expect(await screen.findByText('Owner: octocat')).toBeVisible();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry request' }),
    );
    await screen.findByRole('link', { name: /Issue #42:/ });
    expect(
      requests.mock.calls.filter(
        ([url]) => url === '/api/repositories/octocat/project-0',
      ),
    ).toHaveLength(1);
  });
  it('blocks label changes/retry during rate cooldown and does not automatically fetch on expiry', async () => {
    vi.useFakeTimers();
    history.replaceState(null, '', '/repositories/octocat/project-0');
    let attempts = 0;
    const { requests } = setup(async (url) =>
      url.includes('/issues?')
        ? ++attempts === 1
          ? json({}, 429, { 'Retry-After': '2' })
          : json(issueFixture())
        : json({ repository: detailFixture }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Requests paused until/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Retry request' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Contribution label')).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      requests.mock.calls.filter(([url]) => url.includes('/issues?')),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retry request' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('link', { name: /Issue #42:/ })).toBeVisible();
  });
  it('times out a detail request and does not fetch issues after failure', async () => {
    vi.useFakeTimers();
    history.replaceState(null, '', '/repositories/octocat/project-0');
    const { requests } = setup(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText(/request timed out/)).toBeVisible();
    expect(requests.mock.calls.some(([url]) => url.includes('/issues?'))).toBe(
      false,
    );
  });
  it('cancels unmounted issues and ignores a late result from a previous label', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    let release!: (response: Response) => void;
    const { requests, unmount } = setup(async (url) =>
      !url.includes('/issues?')
        ? json({ repository: detailFixture })
        : url.includes('help-wanted')
          ? json({ ...issueFixture('help-wanted'), issues: [] })
          : new Promise((resolve) => {
              release = resolve;
            }),
    );
    await screen.findByText('Loading contribution issues…');
    fireEvent.change(screen.getByLabelText('Contribution label'), {
      target: { value: 'help-wanted' },
    });
    expect(await screen.findByText(/No open “help wanted”/)).toBeVisible();
    await act(async () => release(json(issueFixture())));
    expect(
      screen.queryByRole('link', { name: /Issue #42:/ }),
    ).not.toBeInTheDocument();
    expect(
      requests.mock.calls.find(([url]) => url.includes('good-first-issue'))?.[1]
        .signal?.aborted,
    ).toBe(true);
    unmount();
  });
  it('cancels old repository requests on route change and rejects stale details', async () => {
    history.replaceState(null, '', '/repositories/octocat/project-0');
    let release!: (response: Response) => void;
    const { requests } = setup(async (url) =>
      url === '/api/repositories/octocat/project-0'
        ? new Promise((resolve) => {
            release = resolve;
          })
        : url.includes('/issues?')
          ? json({
              ...issueFixture(),
              issues: [],
              browse_url:
                'https://github.com/octocat/project-1/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22',
            })
          : json({
              repository: {
                ...detailFixture,
                name: 'project-1',
                url: 'https://github.com/octocat/project-1',
              },
            }),
    );
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => go('/repositories/octocat/project-1'));
    expect(await screen.findByText('Owner: octocat')).toBeVisible();
    await act(async () => release(json({ repository: detailFixture })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'project-1',
    );
    expect(
      requests.mock.calls.find(([url]) => url.endsWith('/project-0'))?.[1]
        .signal?.aborted,
    ).toBe(true);
  });
});

describe('detail/issue runtime contracts', () => {
  it.each([
    null,
    {},
    { repository: { ...detailFixture, url: 'javascript:bad' } },
    {
      repository: {
        ...detailFixture,
        name: 'different',
        url: 'https://github.com/octocat/different',
      },
    },
  ])('rejects invalid detail data %#', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
    await expect(
      getRepository('octocat', 'project-0', new AbortController().signal),
    ).rejects.toThrow('unexpected response');
  });
  it.each([
    null,
    {},
    { ...issueFixture(), limit: 100 },
    { ...issueFixture(), label: 'help-wanted' },
    { ...issueFixture(), browse_url: 'https://evil.example' },
    {
      ...issueFixture(),
      issues: [{ ...issueFixture().issues[0], url: 'javascript:alert(1)' }],
    },
    {
      ...issueFixture(),
      issues: [
        {
          ...issueFixture().issues[0],
          url: 'https://github.com/octocat/project-0/pull/42',
        },
      ],
    },
    {
      ...issueFixture(),
      issues: [{ ...issueFixture().issues[0], state: 'closed' }],
    },
    {
      ...issueFixture(),
      issues: [{ ...issueFixture().issues[0], labels: ['other'] }],
    },
  ])('rejects malformed/unsafe issue contracts %#', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
    await expect(
      getIssues(
        'octocat',
        'project-0',
        'good-first-issue',
        new AbortController().signal,
      ),
    ).rejects.toThrow('unexpected response');
  });
});
