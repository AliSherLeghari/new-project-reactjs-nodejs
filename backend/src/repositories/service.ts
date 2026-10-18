import { type GithubClient } from '../github/client.js';
import { TtlCache } from './cache.js';
import { count, mapRepository, record, type Repository } from './mapping.js';
import { invalidUpstream } from './errors.js';
import { type SearchInput } from './validation.js';

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
export function createRepositoryService(
  client: GithubClient,
  options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
) {
  const cache = new TtlCache<SearchResult | { repository: Repository }>(
    options.ttlMs,
    options.maxEntries,
    options.now,
  );
  async function cached<T extends SearchResult | { repository: Repository }>(
    url: URL,
    load: () => Promise<T>,
  ): Promise<T> {
    const key = url.href;
    const hit = cache.get(key);
    if (hit) return hit as T;
    const value = await load();
    cache.set(key, value);
    return value;
  }
  return {
    async search(input: SearchInput): Promise<SearchResult> {
      const url = new URL('https://api.github.com/search/repositories');
      url.search = new URLSearchParams({
        q: `${input.q} is:public${input.language ? ` language:"${input.language}"` : ''}`,
        order: input.order,
        page: String(input.page),
        per_page: String(input.perPage),
        ...(input.sort !== 'best-match' ? { sort: input.sort } : {}),
      }).toString();
      return cached(url, async () => {
        const body = record(await client.get(url));
        const total = count(body.total_count);
        if (
          !Array.isArray(body.items) ||
          body.items.length > input.perPage ||
          typeof body.incomplete_results !== 'boolean'
        )
          invalidUpstream();
        const accessiblePages = Math.min(
          Math.ceil(total / input.perPage),
          Math.floor(1000 / input.perPage),
        );
        return {
          repositories: body.items.map(mapRepository),
          pagination: {
            page: input.page,
            per_page: input.perPage,
            total_count: total,
            accessible_pages: accessiblePages,
            has_next_page:
              input.page < accessiblePages &&
              body.items.length === input.perPage,
            search_limit: 1000,
            truncated: total > accessiblePages * input.perPage,
            incomplete_results: body.incomplete_results,
          },
        };
      });
    },
    async detail(
      owner: string,
      repo: string,
    ): Promise<{ repository: Repository }> {
      const url = new URL(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      );
      return cached(url, async () => ({
        repository: mapRepository(await client.get(url)),
      }));
    },
  };
}
export type RepositoryService = ReturnType<typeof createRepositoryService>;
