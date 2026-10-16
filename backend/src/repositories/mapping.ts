import { invalidUpstream } from './errors.js';

export interface Repository {
  name: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  url: string;
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalidUpstream();
  return value as Record<string, unknown>;
}
export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalidUpstream();
  return value;
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') invalidUpstream();
  return value;
}
export function mapRepository(value: unknown): Repository {
  const item = record(value);
  const owner = record(item.owner);
  if (
    typeof item.name !== 'string' ||
    !item.name ||
    typeof owner.login !== 'string' ||
    !owner.login ||
    item.private !== false ||
    typeof item.html_url !== 'string'
  )
    invalidUpstream();
  let url: URL;
  try {
    url = new URL(item.html_url);
  } catch {
    return invalidUpstream();
  }
  if (
    url.origin !== 'https://github.com' ||
    url.username ||
    url.password ||
    url.pathname.toLowerCase() !==
      `/${owner.login}/${item.name}`.toLowerCase() ||
    url.search ||
    url.hash
  )
    invalidUpstream();
  return {
    name: item.name,
    owner: owner.login,
    description: nullableText(item.description),
    language: nullableText(item.language),
    stars: count(item.stargazers_count),
    forks: count(item.forks_count),
    open_issues: count(item.open_issues_count),
    url: url.href,
  };
}
