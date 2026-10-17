import type { Repository, SearchResult } from './types';

export function makeRepository(index = 0): Repository {
  return {
    owner: 'octocat',
    name: `project-${index}`,
    description: 'A useful open-source project.',
    language: 'TypeScript',
    stars: 1250,
    forks: 32,
    open_issues: 7,
    url: `https://github.com/octocat/project-${index}`,
  };
}
export function makeResult(
  options: {
    page?: number;
    perPage?: number;
    total?: number;
    incomplete?: boolean;
    repositories?: Repository[];
  } = {},
): SearchResult {
  const { page = 1, perPage = 20, total = 1, incomplete = false } = options;
  const pages = Math.min(
    Math.ceil(total / perPage),
    Math.floor(1000 / perPage),
  );
  const repositories =
    options.repositories ??
    Array.from(
      { length: Math.min(perPage, Math.max(0, total - (page - 1) * perPage)) },
      (_, index) => makeRepository((page - 1) * perPage + index),
    );
  return {
    repositories,
    pagination: {
      page,
      per_page: perPage,
      total_count: total,
      accessible_pages: pages,
      has_next_page: page < pages && repositories.length === perPage,
      search_limit: 1000,
      truncated: total > pages * perPage,
      incomplete_results: incomplete,
    },
  };
}
