import { invalidInput } from './errors.js';

export interface SearchInput {
  q: string;
  language?: string;
  sort: 'best-match' | 'stars' | 'forks' | 'updated';
  order: 'asc' | 'desc';
  page: number;
  perPage: number;
}

function text(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    invalidInput(`${name} must be a single string.`);
  if (/\p{Cc}/u.test(value))
    invalidInput(`${name} must not contain control characters.`);
  return value.trim().replace(/\s+/gu, ' ');
}

function integer(value: unknown, name: string, fallback: number): number {
  const normalized = text(value, name);
  if (normalized === undefined) return fallback;
  if (
    !/^\d+$/.test(normalized) ||
    !Number.isSafeInteger(Number(normalized)) ||
    Number(normalized) < 1
  ) {
    invalidInput(`${name} must be a positive integer.`);
  }
  return Number(normalized);
}

export function validateSearch(query: Record<string, unknown>): SearchInput {
  const allowed = new Set([
    'q',
    'language',
    'sort',
    'order',
    'page',
    'per_page',
  ]);
  if (Object.keys(query).some((key) => !allowed.has(key)))
    invalidInput('Unknown search parameter.');
  const q = text(query.q, 'q');
  if (!q || q.length > 200 || q.includes(':'))
    invalidInput(
      'q must contain 1–200 characters of search text, without qualifier colons.',
    );
  const language = text(query.language, 'language');
  if (
    language !== undefined &&
    (!language ||
      language.length > 50 ||
      !/^[\p{L}\p{N} .+#-]+$/u.test(language))
  ) {
    invalidInput(
      'language must contain 1–50 letters, digits, spaces, or .+#- characters.',
    );
  }
  const sort = text(query.sort, 'sort') ?? 'best-match';
  if (
    sort !== 'best-match' &&
    sort !== 'stars' &&
    sort !== 'forks' &&
    sort !== 'updated'
  )
    invalidInput('sort must be best-match, stars, forks, or updated.');
  const order = text(query.order, 'order') ?? 'desc';
  if (order !== 'asc' && order !== 'desc')
    invalidInput('order must be asc or desc.');
  const perPage = Math.min(integer(query.per_page, 'per_page', 20), 50);
  const page = integer(query.page, 'page', 1);
  if (page > Math.floor(1000 / perPage))
    invalidInput(
      'page exceeds the GitHub search window for this per_page value.',
    );
  return { q, language: language?.toLowerCase(), sort, order, page, perPage };
}

export function validateRepository(
  owner: unknown,
  repo: unknown,
): { owner: string; repo: string } {
  if (
    typeof owner !== 'string' ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    owner.includes('--')
  ) {
    invalidInput(
      'owner must be a valid GitHub username or organization name (1–39 characters).',
    );
  }
  if (
    typeof repo !== 'string' ||
    !/^[a-z\d_.-]{1,100}$/i.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    invalidInput(
      'repo must contain 1–100 letters, digits, dots, underscores, or hyphens.',
    );
  }
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}
