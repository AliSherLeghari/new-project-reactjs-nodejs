import type { Repository, SearchRequest, SearchResult } from './types';

export class SearchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAt?: number,
  ) {
    super(message);
  }
}
export function invalidResponse(): never {
  throw new SearchError(
    'The backend returned an unexpected response. Please try again.',
  );
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalidResponse();
  return value as Record<string, unknown>;
}
export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalidResponse();
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') invalidResponse();
  return value;
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') invalidResponse();
  return value;
}
export function parseRepository(value: unknown): Repository {
  const item = object(value);
  if (
    typeof item.name !== 'string' ||
    !/^[a-z\d_.-]{1,100}$/i.test(item.name) ||
    ['.', '..'].includes(item.name) ||
    typeof item.owner !== 'string' ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(item.owner) ||
    typeof item.url !== 'string'
  )
    invalidResponse();
  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return invalidResponse();
  }
  if (
    url.origin !== 'https://github.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.toLowerCase() !== `/${item.owner}/${item.name}`.toLowerCase()
  )
    invalidResponse();
  return {
    name: item.name,
    owner: item.owner,
    url: url.href,
    description: nullableText(item.description),
    language: nullableText(item.language),
    stars: count(item.stars),
    forks: count(item.forks),
    open_issues: count(item.open_issues),
  };
}
export function parseSearchResult(
  value: unknown,
  request: SearchRequest,
): SearchResult {
  const body = object(value);
  const p = object(body.pagination);
  if (
    !Array.isArray(body.repositories) ||
    body.repositories.length > request.perPage
  )
    invalidResponse();
  const pagination = {
    page: count(p.page),
    per_page: count(p.per_page),
    total_count: count(p.total_count),
    accessible_pages: count(p.accessible_pages),
    has_next_page: flag(p.has_next_page),
    search_limit: count(p.search_limit),
    truncated: flag(p.truncated),
    incomplete_results: flag(p.incomplete_results),
  };
  if (
    pagination.page !== request.page ||
    pagination.per_page !== request.perPage ||
    pagination.search_limit !== 1000 ||
    pagination.accessible_pages !==
      Math.min(
        Math.ceil(pagination.total_count / request.perPage),
        Math.floor(1000 / request.perPage),
      ) ||
    (pagination.has_next_page &&
      (request.page >= pagination.accessible_pages ||
        body.repositories.length !== request.perPage))
  )
    invalidResponse();
  return { repositories: body.repositories.map(parseRepository), pagination };
}
function retryTime(response: Response, body: unknown): number | undefined {
  if (response.status !== 429 && response.status !== 503) return undefined;
  const now = Date.now();
  const hints: number[] = [];
  const addSeconds = (value: unknown) => {
    if (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      now + value * 1000 <= 8_640_000_000_000_000
    )
      hints.push(now + value * 1000);
  };
  const header = response.headers.get('retry-after');
  if (header && /^\d+$/.test(header)) addSeconds(Number(header));
  else if (header) {
    const date = Date.parse(header);
    if (Number.isFinite(date)) hints.push(date);
  }
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
  ) {
    if ('retry_after_seconds' in body.error)
      addSeconds(body.error.retry_after_seconds);
    if ('rate_limit_reset' in body.error) {
      const reset = body.error.rate_limit_reset;
      if (
        typeof reset === 'number' &&
        Number.isSafeInteger(reset) &&
        reset >= 0 &&
        reset * 1000 <= 8_640_000_000_000_000
      )
        hints.push(reset * 1000);
    }
  }
  if (!hints.length && response.status !== 429) return undefined;
  return Math.max(now + 1000, ...(hints.length ? hints : [now + 60_000]));
}
const messages: Record<number, string> = {
  400: 'The search was rejected. Check your search text and filters.',
  404: 'The search endpoint was not found. Please try again later.',
  429: 'The request limit was reached. Wait before searching again.',
  502: 'The backend could not get valid results from GitHub. Please try again.',
  503: 'Search is temporarily unavailable. Please try again later.',
  504: 'GitHub took too long to respond. Please try again later.',
};
export async function searchRepositories(
  request: SearchRequest,
  signal: AbortSignal,
): Promise<SearchResult> {
  const query = new URLSearchParams({
    q: request.q,
    sort: request.sort,
    order: request.order,
    page: String(request.page),
    per_page: String(request.perPage),
  });
  if (request.language) query.set('language', request.language);
  return requestJson(`/api/repositories?${query}`, signal, (body) =>
    parseSearchResult(body, request),
  );
}

// Shared transport for search, details, and contribution issues; no browser-direct GitHub calls.
export async function requestJson<T>(
  path: string,
  signal: AbortSignal,
  parse: (body: unknown) => T,
  context: 'search' | 'details' | 'issues' = 'search',
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);
  try {
    const response = await fetch(path, {
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (response.ok) invalidResponse();
    }
    if (!response.ok)
      throw new SearchError(
        context === 'search'
          ? (messages[response.status] ??
              'Search failed. Please try again later.')
          : response.status === 404
            ? 'Public repository not found, or issues are unavailable for this repository.'
            : response.status === 429
              ? 'The request limit was reached. Wait before trying again.'
              : response.status === 504
                ? 'GitHub took too long to respond. Please try again later.'
                : 'Repository data is temporarily unavailable. Please try again later.',
        response.status,
        retryTime(response, body),
      );
    return parse(body);
  } catch (error) {
    if (signal.aborted)
      throw new DOMException('Search cancelled.', 'AbortError');
    if (timedOut)
      throw new SearchError(
        context === 'search'
          ? 'The search timed out. Please try again.'
          : 'The request timed out. Please try again.',
        504,
      );
    if (error instanceof SearchError) throw error;
    throw new SearchError(
      'Cannot reach the backend. Check your connection and try again.',
    );
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
