import { useEffect, useRef } from 'react';
import { SearchExplorer } from './search/SearchExplorer';
import { RepositoryDetails } from './details/RepositoryDetails';
import { AppLink, useRoute } from './routing';

export function App() {
  const route = useRoute();
  const kind = route.kind;
  const owner = route.kind === 'detail' ? route.owner : '';
  const repo = route.kind === 'detail' ? route.repo : '';
  const routeKey = `${kind}/${owner}/${repo}`;
  const previousRoute = useRef(routeKey);
  useEffect(() => {
    const id =
      kind === 'search'
        ? 'search-page-title'
        : kind === 'detail'
          ? 'detail-title'
          : 'missing-title';
    if (previousRoute.current !== routeKey || kind !== 'search')
      document.getElementById(id)?.focus();
    previousRoute.current = routeKey;
    document.title =
      kind === 'detail'
        ? `${owner}/${repo} · OpenSource Explorer`
        : 'OpenSource Explorer';
  }, [kind, owner, repo, routeKey]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <AppLink className="brand" href="/">
          OpenSource Explorer
        </AppLink>
        <nav aria-label="Main navigation">
          <AppLink href="/">Explore</AppLink>
        </nav>
      </header>
      <main id="main">
        <div hidden={route.kind !== 'search'}>
          <section className="search-intro" aria-labelledby="search-page-title">
            <h1 id="search-page-title" tabIndex={-1}>
              Repository explorer
            </h1>
            <p>
              Search public repositories and explore open contribution issues.
            </p>
          </section>
          <SearchExplorer />
        </div>
        {route.kind === 'detail' && (
          <RepositoryDetails owner={route.owner} repo={route.repo} />
        )}
        {route.kind === 'missing' && (
          <section className="detail-page">
            <h1 id="missing-title" tabIndex={-1}>
              Page not found
            </h1>
            <p>This address does not identify a valid repository page.</p>
            <AppLink href="/">Back to search</AppLink>
          </section>
        )}
      </main>
      <footer>
        OpenSource Explorer{' '}
        <span>
          A student project built with React, TypeScript, and the public GitHub
          API.
        </span>
      </footer>
    </>
  );
}
