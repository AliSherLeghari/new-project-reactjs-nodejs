import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchExplorer } from './SearchExplorer';
import { searchRepositories } from './api';
import { initialFilters } from './types';
import { makeRepository, makeResult } from './testFixtures';

const response = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
function setup(
  handler: (
    url: string,
    options: RequestInit,
  ) => Promise<Response> = async () => response(makeResult()),
) {
  const search = vi.fn(handler);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options: RequestInit) =>
      url === '/api/health'
        ? Promise.resolve(
            response({ status: 'ok', service: 'opensource-explorer-api' }),
          )
        : search(url, options),
    ),
  );
  const view = render(<SearchExplorer />);
  return { search, ...view };
}
function submit(q = 'react') {
  fireEvent.change(screen.getByLabelText('Repository or topic'), {
    target: { value: q },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Repository search' }));
}
const status = () => screen.getByRole('status', { name: 'Search status' });

describe('working search form and results', () => {
  it('does not search on mount or edits; submits normalized filters and displays all card fields safely', async () => {
    const item = {
      ...makeRepository(),
      description: '<img src=x onerror=alert(1)>',
    };
    const { search } = setup(async () =>
      response(makeResult({ repositories: [item] })),
    );
    expect(search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'c++' },
    });
    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'stars' },
    });
    fireEvent.change(screen.getByLabelText('Order'), {
      target: { value: 'asc' },
    });
    expect(search).not.toHaveBeenCalled();
    submit('  react   & tools  ');
    expect(status()).toHaveTextContent('Searching');
    const link = await screen.findByRole('link', {
      name: 'View octocat/project-0 on GitHub (opens in a new tab)',
    });
    expect(link).toHaveAttribute('href', item.url);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(item.description)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeVisible();
    expect(screen.getByText('32')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText('Open issues & PRs')).toBeVisible();
    const url = new URL(search.mock.calls[0][0], 'http://app.test');
    expect(url.pathname).toBe('/api/repositories');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'react & tools',
      sort: 'stars',
      order: 'asc',
      page: '1',
      per_page: '20',
      language: 'c++',
    });
    expect(search).toHaveBeenCalledTimes(1);
  });
  it.each(['', '   ', 'x'.repeat(201), 'owner:octocat', 'hi\tthere'])(
    'validates invalid query %# before requesting',
    async (q) => {
      const { search } = setup();
      submit(q);
      expect(screen.getByRole('alert')).toBeVisible();
      expect(screen.getByLabelText('Repository or topic')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.getByLabelText('Repository or topic')).toHaveFocus();
      expect(search).not.toHaveBeenCalled();
      await screen.findByText('Backend connected');
    },
  );
  it('states explicitly when description and language are absent', async () => {
    setup(async () =>
      response(
        makeResult({
          repositories: [
            { ...makeRepository(), description: null, language: null },
          ],
        }),
      ),
    );
    submit();
    expect(await screen.findByText('No description provided.')).toBeVisible();
    expect(screen.getByText('Language not specified')).toBeVisible();
  });
  it('shows empty state without claiming an API failure', async () => {
    setup(async () => response(makeResult({ total: 0 })));
    submit();
    await waitFor(() =>
      expect(status()).toHaveTextContent('No repositories found'),
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Retry search' }),
    ).not.toBeInTheDocument();
  });
  it('paginates submitted filters and resets to page 1 after draft filter changes', async () => {
    const { search } = setup(async (url) => {
      const params = new URL(url, 'http://app.test').searchParams;
      return response(
        makeResult({
          total: 21,
          page: Number(params.get('page')),
          perPage: Number(params.get('per_page')),
        }),
      );
    });
    submit();
    await screen.findByRole('link', { name: /octocat\/project-0 / });
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByRole('link', { name: /octocat\/project-20 / });
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'python' },
    });
    fireEvent.change(screen.getByLabelText('Results per page'), {
      target: { value: '10' },
    });
    expect(screen.getByText(/Filters changed/)).toBeVisible();
    expect(screen.getByText(/Last submitted:.*Any language/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    expect(search).toHaveBeenCalledTimes(2);
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() =>
      expect(status()).toHaveTextContent('10 repositories shown'),
    );
    const last = search.mock.calls[2][0];
    expect(last).toContain('page=1');
    expect(last).toContain('per_page=10');
    expect(last).toContain('language=python');
  });
  it('communicates truncation and incomplete search results', async () => {
    setup(async () => response(makeResult({ total: 2000, incomplete: true })));
    submit();
    expect(await screen.findByText(/first 1,000-result/)).toBeVisible();
    expect(
      screen.getByText(/GitHub returned incomplete results/),
    ).toBeVisible();
  });
  it('respects has_next_page even when other accessible pages are reported', async () => {
    const result = makeResult({ total: 21 });
    result.pagination.has_next_page = false;
    setup(async () => response(result));
    submit();
    await screen.findByRole('link', { name: /octocat\/project-0 / });
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});

describe('errors, cooldown, and request lifecycle', () => {
  it.each([
    [400, 'search was rejected'],
    [404, 'endpoint was not found'],
    [429, 'request limit'],
    [502, 'valid results'],
    [503, 'temporarily unavailable'],
    [504, 'too long'],
    [500, 'Search failed'],
  ])('renders a safe message for HTTP %i', async (code, message) => {
    setup(async () =>
      response(
        { error: { message: 'private internal message' } },
        code as number,
      ),
    );
    submit();
    await waitFor(() => expect(status()).toHaveTextContent(message as string));
    expect(
      screen.queryByText('private internal message'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeVisible();
  });
  it('allows manual retry after a network failure', async () => {
    let attempts = 0;
    const { search } = setup(async () => {
      if (attempts++ === 0) throw new Error('private network detail');
      return response(makeResult());
    });
    submit();
    await waitFor(() => expect(status()).toHaveTextContent('Cannot reach'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }));
    await screen.findByRole('link', { name: /octocat\/project-0 / });
    expect(search).toHaveBeenCalledTimes(2);
  });
  it('respects the longest retry/reset hint, blocks repeated submissions, and never retries automatically', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    let attempts = 0;
    const { search } = setup(async () =>
      attempts++ === 0
        ? response(
            {
              error: {
                retry_after_seconds: 2,
                rate_limit_reset: Date.now() / 1000 + 3,
              },
            },
            429,
            { 'Retry-After': '1' },
          )
        : response(makeResult()),
    );
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      screen.getByRole('status', { name: 'Retry guidance' }),
    ).toHaveTextContent('nothing will retry automatically');
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeEnabled();
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(status()).toHaveTextContent('1 repository shown');
    expect(search).toHaveBeenCalledTimes(2);
  });
  it('defaults malformed rate-limit hints to a 60-second cooldown', async () => {
    vi.useFakeTimers();
    setup(
      async () =>
        new Response('not JSON', {
          status: 429,
          headers: { 'Retry-After': 'invalid' },
        }),
    );
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('button', { name: 'Retry search' })).toBeEnabled();
  });
  it('times out a stalled request and aborts it', async () => {
    vi.useFakeTimers();
    const { search } = setup(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(status()).toHaveTextContent('search timed out');
    expect(search.mock.calls[0][1].signal?.aborted).toBe(true);
  });
  it('cancels an old search, ignores late success, and suppresses duplicate in-flight submissions', async () => {
    let resolveOld!: (value: Response) => void;
    const { search } = setup(async (url) =>
      url.includes('q=old')
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : response(makeResult()),
    );
    submit('old');
    fireEvent.submit(screen.getByRole('form'));
    expect(search).toHaveBeenCalledTimes(1);
    submit('new');
    expect(search.mock.calls[0][1].signal?.aborted).toBe(true);
    await screen.findByRole('link', { name: /octocat\/project-0 / });
    await act(async () => resolveOld(response(makeResult({ total: 0 }))));
    expect(status()).toHaveTextContent('1 repository shown for “new”');
  });
  it('ignores stale failures instead of imposing cooldown on a newer successful search', async () => {
    let resolveOld!: (value: Response) => void;
    setup(async (url) =>
      url.includes('q=old')
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : response(makeResult()),
    );
    submit('old');
    submit('new');
    await screen.findByRole('link', { name: /octocat\/project-0 / });
    await act(async () => resolveOld(response({}, 429)));
    expect(status()).toHaveTextContent('1 repository shown for “new”');
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });
  it('aborts on unmount', async () => {
    const { search, unmount } = setup(() => new Promise(() => {}));
    submit();
    await screen.findByText('Backend connected');
    unmount();
    expect(search.mock.calls[0][1].signal?.aborted).toBe(true);
  });
});

describe('runtime API contract checks', () => {
  const request = { ...initialFilters, q: 'react', page: 1 };
  it.each([
    'not JSON',
    'null',
    '{}',
    JSON.stringify({
      ...makeResult(),
      repositories: [{ ...makeRepository(), url: 'javascript:alert(1)' }],
    }),
    JSON.stringify({
      ...makeResult(),
      repositories: [
        { ...makeRepository(), url: 'https://evil.example/octocat/project-0' },
      ],
    }),
    JSON.stringify({
      ...makeResult(),
      repositories: [
        { ...makeRepository(), url: 'https://github.com/other/project-0' },
      ],
    }),
    JSON.stringify({
      ...makeResult(),
      repositories: [
        {
          ...makeRepository(),
          url: 'https://user:pass@github.com/octocat/project-0',
        },
      ],
    }),
    JSON.stringify({
      ...makeResult(),
      repositories: [{ ...makeRepository(), stars: -1 }],
    }),
    JSON.stringify({
      ...makeResult(),
      repositories: [{ ...makeRepository(), description: {} }],
    }),
    JSON.stringify({
      ...makeResult(),
      pagination: { ...makeResult().pagination, page: 2 },
    }),
    JSON.stringify({
      ...makeResult(),
      pagination: { ...makeResult().pagination, accessible_pages: 99999 },
    }),
    JSON.stringify({
      ...makeResult(),
      pagination: { ...makeResult().pagination, has_next_page: true },
    }),
  ])('rejects malformed data and unsafe URLs %#', async (raw) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(raw)));
    await expect(
      searchRepositories(request, new AbortController().signal),
    ).rejects.toThrow('unexpected response');
  });
  it('does not allow next-page metadata beyond the search window', async () => {
    const result = makeResult({ page: 50, total: 2000 });
    result.pagination.has_next_page = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(result)));
    await expect(
      searchRepositories(
        { ...request, page: 50 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('unexpected response');
  });
  it('parses HTTP-date Retry-After for maintenance without echoing arbitrary error messages', async () => {
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ error: { message: '<script>bad</script>' } }, 503, {
          'Retry-After': 'Sat, 17 Oct 2026 12:02:00 GMT',
        }),
      ),
    );
    await expect(
      searchRepositories(request, new AbortController().signal),
    ).rejects.toMatchObject({
      status: 503,
      retryAt: Date.parse('2026-10-17T12:02:00Z'),
    });
  });
  it('keeps the deadline active while parsing a slow body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                options.signal?.addEventListener('abort', () =>
                  controller.error(new Error('aborted')),
                );
              },
            }),
          ),
        ),
      ),
    );
    const assertion = expect(
      searchRepositories(request, new AbortController().signal),
    ).rejects.toThrow('search timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
  it('distinguishes explicit cancellation from a retryable timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')));
    await expect(
      searchRepositories(request, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
