import { ApiError, invalidUpstream } from '../repositories/errors.js';

export type Fetch = typeof globalThis.fetch;
export interface GithubClient {
  get(url: URL): Promise<unknown>;
}

function rateGuidance(headers: Headers, now: number) {
  const resetText = headers.get('x-ratelimit-reset');
  const reset =
    resetText && /^\d+$/.test(resetText) ? Number(resetText) : undefined;
  const rateLimitReset =
    reset !== undefined &&
    Number.isSafeInteger(reset) &&
    reset >= 0 &&
    reset <= 8_640_000_000_000
      ? reset
      : undefined;
  const retry = headers.get('retry-after');
  let seconds =
    retry && /^\d+$/.test(retry)
      ? Number(retry)
      : retry
        ? Math.ceil((Date.parse(retry) - now) / 1000)
        : NaN;
  if (!Number.isFinite(seconds) && rateLimitReset !== undefined)
    seconds = Math.ceil(rateLimitReset - now / 1000);
  return {
    retryAfterSeconds: Number.isFinite(seconds)
      ? Math.max(1, Math.min(seconds, 86400))
      : 60,
    rateLimitReset,
  };
}

export function createGithubClient(
  options: { fetch?: Fetch; timeoutMs?: number; now?: () => number } = {},
): GithubClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const now = options.now ?? Date.now;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
    throw new Error(
      'GITHUB_TIMEOUT_MS must be an integer between 100 and 30000.',
    );
  return {
    async get(url) {
      if (
        url.origin !== 'https://api.github.com' ||
        url.username ||
        url.password
      )
        throw new Error('Unexpected GitHub API destination.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(url, {
          signal: controller.signal,
          redirect: 'error',
          headers: {
            'User-Agent': 'OpenSource-Explorer',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (!response.ok) {
          let limited =
            response.status === 429 ||
            (response.status === 403 &&
              (response.headers.get('x-ratelimit-remaining') === '0' ||
                response.headers.has('retry-after')));
          // Some secondary limits have no rate headers. Inspect only the message for classification;
          // never return the original body to the caller.
          if (response.status === 403 && !limited) {
            const body: unknown = await response
              .json()
              .catch((error: unknown) => {
                if (controller.signal.aborted) throw error;
                return null;
              });
            limited =
              typeof body === 'object' &&
              body !== null &&
              'message' in body &&
              typeof body.message === 'string' &&
              /rate limit/i.test(body.message);
          }
          if (!response.bodyUsed) await response.body?.cancel();
          if (limited) {
            const guidance = rateGuidance(response.headers, now());
            throw new ApiError(
              429,
              'RATE_LIMITED',
              'GitHub request limit reached. Wait before retrying; avoid repeated requests.',
              guidance.retryAfterSeconds,
              guidance.rateLimitReset,
            );
          }
          if (response.status === 404)
            throw new ApiError(
              404,
              'REPOSITORY_NOT_FOUND',
              'Public repository not found.',
            );
          if (response.status === 422)
            throw new ApiError(
              400,
              'SEARCH_REJECTED',
              'GitHub could not process this search. Simplify the query or check pagination.',
            );
          if (response.status === 403 || response.status === 503)
            throw new ApiError(
              503,
              'GITHUB_UNAVAILABLE',
              'GitHub is temporarily unavailable or access is restricted.',
              response.headers.has('retry-after')
                ? rateGuidance(response.headers, now()).retryAfterSeconds
                : undefined,
            );
          throw new ApiError(
            502,
            'GITHUB_ERROR',
            'GitHub could not complete the request.',
          );
        }
        try {
          return await response.json();
        } catch (error) {
          if (controller.signal.aborted) throw error;
          return invalidUpstream();
        }
      } catch (error) {
        if (controller.signal.aborted)
          throw new ApiError(
            504,
            'GITHUB_TIMEOUT',
            'GitHub did not respond in time. Try again later.',
          );
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          502,
          'GITHUB_NETWORK_ERROR',
          'Could not reach GitHub. Try again later.',
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
