export interface SearchFilters {
  q: string;
  language: string;
  sort: 'best-match' | 'stars' | 'forks' | 'updated';
  order: 'desc' | 'asc';
  perPage: 10 | 20 | 50;
}
export interface SearchRequest extends SearchFilters {
  page: number;
}
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
export interface SearchResult {
  repositories: Repository[];
  pagination: {
    page: number;
    per_page: number;
    total_count: number;
    accessible_pages: number;
    has_next_page: boolean;
    search_limit: number;
    truncated: boolean;
    incomplete_results: boolean;
  };
}
export const initialFilters: SearchFilters = {
  q: '',
  language: '',
  sort: 'best-match',
  order: 'desc',
  perPage: 20,
};
export function normalizeFilters(filters: SearchFilters): SearchFilters {
  return {
    ...filters,
    q: filters.q.trim().replace(/\s+/gu, ' '),
    language: filters.language.toLowerCase(),
  };
}
export function queryError(q: string): string | undefined {
  if (/\p{Cc}/u.test(q))
    return 'Search text must not contain control characters.';
  const normalized = q.trim().replace(/\s+/gu, ' ');
  if (!normalized) return 'Enter a repository name or topic.';
  if (normalized.length > 200) return 'Use 200 characters or fewer.';
  if (normalized.includes(':'))
    return 'Use plain search text without qualifier colons (:).';
}
