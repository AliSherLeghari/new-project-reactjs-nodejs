import { useRef, useState, type FormEvent } from 'react';
import { BackendStatus } from '../BackendStatus';
import { RepositoryCard } from './RepositoryCard';
import {
  initialFilters,
  normalizeFilters,
  queryError,
  type SearchFilters,
} from './types';
import { useRepositorySearch } from './useRepositorySearch';

const sortLabels = {
  'best-match': 'Best match',
  stars: 'Most stars',
  forks: 'Most forks',
  updated: 'Recently updated',
};
export function SearchExplorer() {
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [validation, setValidation] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const { state, run, coolingDown, retryAt } = useRepositorySearch();
  const submitted = state.status === 'idle' ? undefined : state.request;
  const normalized = normalizeFilters(filters);
  const dirty =
    submitted !== undefined &&
    (Object.keys(normalized) as (keyof SearchFilters)[]).some(
      (key) => normalized[key] !== submitted[key],
    );
  function update<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setValidation(undefined);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = queryError(filters.q);
    setValidation(error);
    if (error) {
      input.current?.focus();
      return;
    }
    void run({ ...normalized, page: 1 });
  }
  function changePage(page: number) {
    if (state.status !== 'success') return;
    resultsHeading.current?.focus();
    void run({ ...state.request, page });
  }
  const status =
    state.status === 'idle'
      ? 'Enter a topic to discover public repositories.'
      : state.status === 'loading'
        ? `Searching for “${state.request.q}”…`
        : state.status === 'error'
          ? state.error.message
          : state.result.repositories.length === 0
            ? 'No repositories found on this page. Try another search or go to the previous page.'
            : `${state.result.repositories.length} ${state.result.repositories.length === 1 ? 'repository' : 'repositories'} shown for “${state.request.q}”, page ${state.result.pagination.page}.`;
  return (
    <section id="explore" aria-labelledby="search-title">
      <div className="search-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR STARTING POINT</p>
            <h2 id="search-title">Explore repositories</h2>
          </div>
          <span className="badge">Public GitHub projects</span>
        </div>
        <p id="search-note">
          Search by name or topic. Choose your filters, then press Search. No
          account needed.
        </p>
        <form aria-label="Repository search" onSubmit={submit} noValidate>
          <div className="search-fields">
            <div>
              <label htmlFor="query">Repository or topic</label>
              <input
                ref={input}
                id="query"
                type="search"
                placeholder="e.g. react, developer tools, accessibility"
                value={filters.q}
                onChange={(event) => update('q', event.target.value)}
                aria-invalid={Boolean(validation)}
                aria-describedby={
                  validation ? 'search-note query-error' : 'search-note'
                }
              />
            </div>
            <div>
              <label htmlFor="language">Language</label>
              <select
                id="language"
                value={filters.language}
                onChange={(event) => update('language', event.target.value)}
              >
                <option value="">Any language</option>
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="go">Go</option>
                <option value="rust">Rust</option>
                <option value="java">Java</option>
                <option value="c++">C++</option>
                <option value="c#">C#</option>
                <option value="ruby">Ruby</option>
              </select>
            </div>
            <button
              className="search-button"
              disabled={coolingDown || (state.status === 'loading' && !dirty)}
            >
              Search
            </button>
          </div>
          {validation && (
            <p id="query-error" className="form-error" role="alert">
              {validation}
            </p>
          )}
          <div className="search-options">
            <div>
              <label htmlFor="sort">Sort by</label>
              <select
                id="sort"
                value={filters.sort}
                onChange={(event) =>
                  update('sort', event.target.value as SearchFilters['sort'])
                }
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="order">Order</label>
              <select
                id="order"
                value={filters.order}
                onChange={(event) =>
                  update('order', event.target.value as SearchFilters['order'])
                }
                aria-describedby="order-note"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
            <div>
              <label htmlFor="page-size">Results per page</label>
              <select
                id="page-size"
                value={filters.perPage}
                onChange={(event) =>
                  update(
                    'perPage',
                    Number(event.target.value) as SearchFilters['perPage'],
                  )
                }
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
          <p id="order-note" className="help-text">
            Best match uses GitHub’s relevance order. Other sorts use your
            chosen order.
          </p>
        </form>
        <BackendStatus />
      </div>
      <section className="search-results" aria-labelledby="results-title">
        <h2 id="results-title" ref={resultsHeading} tabIndex={-1}>
          {state.status === 'idle'
            ? 'Your next discovery starts here'
            : 'Search results'}
        </h2>
        {submitted && (
          <p className="submitted-search">
            Last submitted: “{submitted.q}” ·{' '}
            {submitted.language || 'Any language'} ·{' '}
            {sortLabels[submitted.sort]} ·{' '}
            {submitted.order === 'asc' ? 'Ascending' : 'Descending'} ·{' '}
            {submitted.perPage} per page · page {submitted.page}
          </p>
        )}
        {dirty && (
          <p className="notice">
            Filters changed. Press Search to apply them and start at page 1.
            Displayed results belong to the last submitted search.
          </p>
        )}
        <p
          role="status"
          aria-label="Search status"
          className={`search-message ${state.status === 'error' ? 'error-message' : ''}`}
        >
          {status}
        </p>
        {coolingDown && (
          <p role="status" aria-label="Retry guidance" className="notice">
            Wait until{' '}
            <time dateTime={new Date(retryAt).toISOString()}>
              {new Date(retryAt).toLocaleString()}
            </time>{' '}
            before trying again. Search and retry are paused; nothing will retry
            automatically.
          </p>
        )}
        {state.status === 'error' && (
          <button
            className="retry"
            disabled={coolingDown || dirty}
            onClick={() => void run(state.request)}
          >
            Retry search
          </button>
        )}
        <div aria-busy={state.status === 'loading'}>
          {state.status === 'success' && (
            <>
              <p className="result-count">
                GitHub reports{' '}
                {state.result.pagination.total_count.toLocaleString()} matches.
                Counts and ordering can change.
              </p>
              {state.result.pagination.truncated && (
                <p className="notice">
                  Results are limited to GitHub’s first 1,000-result search
                  window. This page size allows at most{' '}
                  {state.result.pagination.accessible_pages} accessible pages.
                </p>
              )}
              {state.result.pagination.incomplete_results && (
                <p className="notice">
                  GitHub returned incomplete results. Counts and pages may be
                  approximate; narrow your search for better results.
                </p>
              )}
              <ul className="repository-grid" aria-label="Repositories">
                {state.result.repositories.map((repository) => (
                  <RepositoryCard
                    key={repository.url}
                    repository={repository}
                  />
                ))}
              </ul>
              <nav className="pagination" aria-label="Search result pages">
                <button
                  disabled={dirty || coolingDown || state.request.page <= 1}
                  onClick={() => changePage(state.request.page - 1)}
                >
                  Previous page
                </button>
                <span>
                  Page {state.request.page} ·{' '}
                  {state.result.pagination.accessible_pages} accessible pages
                  reported
                </span>
                <button
                  disabled={
                    dirty ||
                    coolingDown ||
                    !state.result.pagination.has_next_page ||
                    state.request.page >=
                      state.result.pagination.accessible_pages
                  }
                  onClick={() => changePage(state.request.page + 1)}
                >
                  Next page
                </button>
              </nav>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
