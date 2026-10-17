# Lesson 04: Repository pages and contribution opportunities

## What we built

Phase 4 turns a search result into an actionable repository page. Each card has an internal **View details** link and a distinct external GitHub link. The detail page shows repository metadata, then loads a small sample of open issues labeled **good first issue** or **help wanted**.

The search page now starts with a compact purpose statement and form instead of the large Phase 3 hero. We kept the neutral/green palette, system fonts, accessible controls, and actual data. No router/UI package, paid service, token, login, database, or deployment was added.

This lesson describes the Phase 4 source. Earlier lessons record their phase snapshots; the shared JSON transport was extended here so existing search behavior could stay tested.

## 1. Actual architecture and files

| File / function                                                                                                                  | Responsibility                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `frontend/src/routing.tsx`: `parseRoute`, `useRoute`, `AppLink`, `repositoryPath`                                                | Validate paths, subscribe to browser navigation, generate/intercept internal links         |
| `frontend/src/App.tsx`: `App`                                                                                                    | Select the active page, preserve search, update document title and focus                   |
| `frontend/src/search/RepositoryCard.tsx`: `RepositoryCard`, `RepositoryMetadata`                                                 | Distinct internal/external actions and reusable language/count display                     |
| `frontend/src/details/RepositoryDetails.tsx`: `RepositoryDetails`, private `ContributionIssues`, `ResourceError`                 | Detail page, label selector, issue states/cards, and retry UI                              |
| `frontend/src/details/api.ts`: `getRepository`, `getIssues`, `browseIssuesUrl`, `issueFilters`                                   | Call our backend and validate detail/issue contracts; construct safe browse links          |
| `frontend/src/details/useResource.ts`: `useResource`, `useCooldown`                                                              | Effect lifecycle, cancellation/stale checks, explicit retries, shared detail-page cooldown |
| `frontend/src/search/api.ts`: `requestJson`, `parseRepository`, `SearchError`                                                    | Reused HTTP deadline/error/retry-hint handling and repository parsing                      |
| `backend/src/repositories/routes.ts`: `createRepositoryRouter`                                                                   | New issue route alongside existing search/detail routes                                    |
| `backend/src/repositories/validation.ts`: `validateRepository`, `validateIssueFilter`                                            | Normalize owner/repo and allow only supported issue parameters                             |
| `backend/src/repositories/service.ts`: `createRepositoryService`, returned `issues` method and private `detail`/`cached` helpers | Public visibility check, fixed upstream URL, shared cache                                  |
| `backend/src/repositories/contributionIssues.ts`: `contributionLabels`, `mapIssueList`, `issueBrowseUrl`                         | Filter PRs, validate/map issue JSON, build the matching GitHub browse URL                  |
| `backend/src/github/client.ts`: `createGithubClient`                                                                             | Existing fixed-host GitHub transport, timeout, rate-limit/error mapping                    |
| `scripts/smoke-issues.mjs`                                                                                                       | Optional manual public API/cache smoke check with sanitized observations                   |

## 2. Routing without a new package

A route maps a URL to an application view. Our routes are `/` for search and `/repositories/:owner/:repo` for details. An unknown or malformed route shows a readable Page not found view.

`parseRoute()` matches the path, decodes each segment, and validates the owner/repo shape. Encoded slashes, invalid escapes, invalid names, and `.`/`..` repository segments cannot become arbitrary API paths. `repositoryPath()` uses `encodeURIComponent` when constructing an internal URL.

`useRoute()` uses React's `useSyncExternalStore` to subscribe to the browser's `popstate` event and read `window.location.pathname`. The browser History API is an external store: React does not automatically know when it changes.

`AppLink()` keeps a real `<a href>` for accessibility, copying addresses, and opening new tabs. For a normal same-origin primary click it performs:

```ts
history.pushState(null, '', href);
window.dispatchEvent(new PopStateEvent('popstate'));
```

`pushState` updates browser history but does not emit `popstate` by itself, hence the explicit event for our subscribers. Real back/forward navigation emits the event naturally. Modified clicks, explicit targets, and external destinations keep native behavior.

This router intentionally supports a small set of pages. It is not a general routing framework. A larger route hierarchy could justify a maintained open-source router later, but this phase did not need another dependency.

## 3. Direct links, refresh, focus, and search preservation

`App()` reads the route and renders details for a valid repository. Vite's SPA fallback serves the frontend document when a detail URL is requested directly or refreshed; browser tests exercise this. Future production hosting must provide the same fallback for application routes while routing `/api` to Express. A compiled build alone does not establish production routing.

Search stays mounted inside a `hidden` container while details are active. This keeps draft inputs, submitted results, and pagination in memory when using Back to search or browser Back. Hidden content is excluded from the accessibility tree. A full refresh loses this in-memory search state; nothing is persisted or stored in an account.

`App` updates `document.title` and focuses the active page heading on route changes. The headings use `tabIndex={-1}` so code can focus them without adding extra stops to normal Tab navigation. Initial search load preserves the normal first keyboard stop at the skip link. Detail-page entry focuses its heading so keyboard and screen-reader users receive navigation context.

## 4. Page lifecycle and asynchronous resources

`RepositoryDetails()` uses `useResource()` to call `getRepository()`. It renders loading or a safe error first. Only a successful, runtime-validated repository mounts `ContributionIssues()`, which requests its selected label. There is no issue request for every result card.

Changing the label starts a new issue resource; repository details do not refetch. Issue failures stay in the issues section, leaving successful repository metadata visible. Switching repositories or leaving details cleans up the previous resource.

The resource states are loading, paused, success, and error. Every state carries a resource key. If the key changes, the hook immediately stops presenting the old key's value while the next effect starts.

The core cleanup is:

```ts
return () => {
  active = false;
  controller.abort();
};
```

The active flag prevents late results/errors updating an obsolete view; AbortController asks fetch to cancel. These protect different parts of the lifecycle. Browser cancellation does not guarantee an already-started GitHub request on the server is cancelled; its existing timeout/cache still apply.

React StrictMode deliberately runs a disposable effect setup/cleanup during development. We defer loading one microtask and check `active` before invoking the loader:

```ts
Promise.resolve().then(() => {
  if (!active) return;
  return loader.current(controller.signal);
});
```

That avoids spending an HTTP request for the immediately discarded setup while retaining StrictMode's checks. A dedicated test verifies one detail call and one issue call under StrictMode.

## 5. Shared transport and rate cooldown

`requestJson()` was extracted from the Phase 3 search request in the same API module. Search, details, and issues now share its relative fetch, 10-second deadline through body parsing, caller abort forwarding, safe HTTP messages, malformed-JSON handling, and validated retry/reset hints. `SearchError` retains its existing name for compatibility and is also used for detail-resource failures.

`getRepository()` validates the returned repository and checks it matches the requested owner/repo. `getIssues()` validates the requested label, fixed limit, fields, labels, issue URLs, and expected browse URL. Types help our code at compile time; runtime checks protect the external JSON boundary.

`useCooldown()` shares a deadline between detail/issue resources. A 429 or retry-guided 503 pauses retries and label selection. The timer updates local UI only. Expiry does not occur in a fetching effect dependency, so it cannot automatically send requests. A user must retry explicitly. If navigating to another repository during that deadline, the new resource pauses until a manual retry is allowed.

Cooldown is memory in the current detail experience. It does not persist across refreshes or coordinate tabs/the separate search experience. The backend/GitHub remain authoritative for limits. The frontend deadline remains 10 seconds; the backend client defaults to 5 seconds per upstream call.

## 6. The contribution issues contract

The new API is:

```http
GET /api/repositories/:owner/:repo/issues?label=good-first-issue
```

`validateIssueFilter()` accepts only a single `label` parameter and these mappings:

| App value                    | GitHub maintainer label |
| ---------------------------- | ----------------------- |
| `good-first-issue` (default) | `good first issue`      |
| `help-wanted`                | `help wanted`           |

Unknown parameters, repeated labels, and arbitrary label names are rejected with 400 before any GitHub call. An allowlist makes request behavior predictable and prevents the UI becoming an unrestricted issue-query tool.

The backend service first calls its cached `detail()` helper, requiring `private: false` in validated metadata. This matters because the managed network proxy may supply authentication even though our code has no Authorization header. Without a public check, a direct issue endpoint could otherwise return data the proxy can access privately.

After that check, the service builds a fixed-host URL with `URL`/`URLSearchParams`:

```text
https://api.github.com/repos/{owner}/{repo}/issues
state=open
labels=good first issue  (or help wanted)
per_page=10
page=1
sort=updated
direction=desc
```

No caller can choose an API host, pagination sweep, arbitrary state, or larger page. A cold direct issue request may make two GitHub calls; opening details first usually means the public metadata is already cached.

## 7. Why filtering pull requests matters

GitHub's repository issue-list endpoint includes both ordinary issues and pull requests. A pull request is a proposed code change, not the same thing as a contribution task. `mapIssueList()` explicitly skips entries containing `pull_request`:

```ts
if ('pull_request' in item) continue;
```

It then validates remaining issue number/title/open state/labels and verifies the HTTPS `github.com/{owner}/{repo}/issues/{number}` URL, with no credentials/query/fragment. It also omits entries whose labels no longer match, for example if labels changed while the response was assembled.

Only a small contract is returned: number, title, state `open`, label strings, and URL. No issue body, Markdown, or private diagnostics are sent. Labels/titles render as React text, not raw HTML. PR exclusion does not turn the bounded response into a complete list: ten upstream entries may contain PRs or nonmatching records, leaving fewer than ten visible issues.

The response also includes `label`, `label_name`, `limit: 10`, and a generated safe `browse_url`. The frontend independently constructs its own fixed-host GitHub issue-search link rather than trusting an arbitrary server destination.

## 8. Data flow and caching

```mermaid
sequenceDiagram
  participant U as User
  participant R as App router / detail page
  participant F as Frontend API client
  participant B as Express repository service
  participant C as Shared TTL cache
  participant G as GitHub REST API
  U->>R: Open View details or shareable URL
  R->>F: getRepository(owner, repo)
  F->>B: GET /api/repositories/owner/repo
  B->>C: Lookup public repository metadata
  opt Cache miss
    B->>G: GET /repos/owner/repo
    G-->>B: Repository JSON
    B->>B: Validate public repository and map
    B->>C: Store successful metadata
  end
  B-->>F: Small repository contract
  F-->>R: Validated repository
  R->>F: getIssues(owner, repo, label)
  F->>B: GET /api/repositories/owner/repo/issues?label=...
  B->>C: Reuse public metadata; check issue key
  opt Issue cache miss
    B->>G: Fixed open labeled issue-list request
    G-->>B: At most ten issue/PR entries
    B->>B: Exclude PRs; validate and map issues
    B->>C: Cache success
  end
  B-->>R: Bounded issue contract
  R-->>U: Issues or constructive empty state + browse link
```

Search, detail, and issue results share the same process-local cache: at most 100 entries, 60-second TTL, successful validated results only, full normalized URL keys, FIFO eviction. A label change has a different key. Reads do not extend TTL, failures are not cached, and a restart clears it. Concurrent misses are not combined and multiple servers do not share quota state.

## 9. Error behavior and honest empty states

The existing GitHub client handles upstream failures and safe retry guidance. Invalid input is 400; missing repositories/issues may be 404; known rate limits become 429; invalid JSON/URLs or upstream failures become 502; access restrictions/maintenance can be 503; deadlines become 504. Unexpected internal failures keep generic 500 handling.

A private repository response fails validation without exposing its issue list. Repository redirects still fail closed, so renamed/transferred repositories may require using the new name. Disabled/restricted issue trackers may be unavailable even when public metadata loads.

Zero matching issues is HTTP 200 with an empty array. The UI suggests trying the other label or browsing GitHub, rather than inventing opportunities. It explicitly says maintainer labels do not guarantee difficulty, availability, or contribution acceptance.

## 10. UI, security, and accessibility decisions

We removed the oversized hero, decorative search badge/eyebrow, and long promotional about section. The compact title, clear form, and restrained borders prioritize the tool. Mobile inputs stack; desktop controls align; existing colors/system fonts remain. No new external assets or heavy UI framework are needed.

Repository metadata is reused by cards and details. Labels are visible text. Links distinguish View details from View on GitHub, and outbound links use verified HTTPS destinations, descriptive new-tab text, and `rel="noopener noreferrer"`.

The app retains the skip link, real form/select labels, polite status messages, visible focus, keyboard navigation, readable error/empty states, and 44px primary controls. Focus and document titles change with routes. Automated axe/contrast checks and screenshots passed, while physical Android/manual screen-reader behavior remains unverified.

`.gitignore` now also excludes TypeScript incremental caches, editor/OS files, and temporary/backups. Code/tests, lockfile, AGENTS.md, secret-free `.env.example`, and deliberate documentation screenshots remain tracked. Ignore rules do not remove an already-tracked secret, so tracked-file checks are necessary too.

## 11. Tests tied to actual behavior

- `backend/src/repositories/contributionIssues.test.ts`: 33 tests for success, exact fixed query/limit, PR/nonmatching-label exclusion, empty results, validation, private visibility, bad JSON/URLs/fields, upstream errors, rate guidance, timeout, cache reuse/expiry, and the shared capacity bound.
- `frontend/src/details/RepositoryDetails.test.tsx`: 31 tests for internal/external navigation, direct URL/remount, back/forward with preserved search, invalid routes, loading/missing fields, filters/empty states, errors/manual retry, cooldown with no automatic request, timeout, stale cancellation, StrictMode, and runtime contracts.
- `tests/details.spec.ts`: five browser cases, including 390px/1280px flows, direct/refresh/back/forward, keyboard focus, safe links, issue filters, empty/not-found/failure/cooldown states, no overflow, and axe scans. Real backend invalid-name rejection is also checked without calling GitHub.
- Existing suites remain: 49 prior frontend tests, 101 prior backend tests, and eight prior browser tests.

The verified totals are 80 frontend, 134 backend, and 13 browser tests. `npm run check` also passed lint/format/type checks and both builds. Unit/browser routine issue responses are mocked so tests do not consume live quota.

The optional built-module smoke script really contacted GitHub through Express: public `microsoft/vscode` returned ten open matching issues, and a cached repeat caused no further upstream requests. It logged only safe status/rate fields and a public issue URL. It asserted no app Authorization header; the observed 15,000 allowance suggests proxy authentication, not proof of truly anonymous wire access. Normal free public unauthenticated quotas and shared-IP/secondary limits still apply. No paid quota or service was enabled.

See `docs/PHASE_4_VERIFICATION.md` for exact outputs, intermediate failures/fixes, and screenshot links. Fixture screenshots are labeled as such; they are not evidence that the fake fixture repository exists publicly.

## 12. Engineering tradeoffs

- **Small native router:** enough for two page types; a mature router becomes useful with nested routes/loaders/complex URL state.
- **Hidden mounted search:** simple preservation on internal navigation; memory is retained and full-refresh restoration is intentionally absent.
- **Shared transport plus small resource hook:** reuses error/deadline behavior without a global state/query framework.
- **Sequential details then issues:** avoids issue calls before a validated repository and reuses public metadata cache; adds a dependent step instead of speculative requests.
- **Bounded repository issue list:** predictable low request volume; deliberately cannot claim every contribution opportunity.
- **Explicit retries and FIFO cache:** simple quota-conscious behavior, with documented limits under concurrency/multiple instances.

## 13. Interview questions

1. **Why doesn't pushState alone update React?** React needs a subscription/event; our router dispatches popstate and uses useSyncExternalStore.
2. **How does refresh on a detail URL work?** The server must return the SPA document for that route; Vite does this in development, and production needs explicit fallback configuration.
3. **How is search preserved?** Its component remains mounted but hidden during internal detail navigation; full refresh clears it.
4. **Why both abort and an active flag?** Cancellation requests stop work; the guard prevents late callbacks changing an obsolete view.
5. **Why defer the resource loader one microtask?** StrictMode's immediately discarded effect can clean up before any HTTP request is sent.
6. **Why validate external JSON despite TypeScript?** TypeScript cannot verify runtime data received over HTTP.
7. **Why check public visibility before issues?** Platform credentials could otherwise grant access beyond anonymous public data.
8. **Why filter pull_request?** GitHub's issue-list API includes PR entries, which should not be labeled as issues.
9. **Why can fewer than ten appear?** The ten-entry upstream window may include PRs or changed labels that we exclude.
10. **Does good first issue guarantee an easy accepted contribution?** No. Maintainers apply labels; users must read requirements and guidelines.
11. **Why not retry automatically on rate limits?** Repeated requests consume shared quotas; show safe guidance and require explicit action.
12. **What does a cached smoke repeat prove?** The tested normalized request reused a successful in-memory result; it does not prove all concurrency/deployment scenarios.

## 14. Android/Codex exercises

Ask Codex to use a separate practice branch and show the diff/check results:

1. Trace an internal View details click through History API, resource hook, Express route, cache, GitHub, and rendered issue link.
2. Add a PR fixture between two ordinary issues and predict the visible count before running the test.
3. Write a test for a mismatched issue number in the URL and explain why runtime validation should reject it.
4. Switch labels during a delayed response and demonstrate why old issue cards must not reappear.
5. Explain the two calls required by a cold direct issue request and why the second identical request uses none.
6. Review the empty-state screenshot and suggest one helpful wording change without promising contribution acceptance.
7. Compare internal navigation with a full refresh and identify which state is preserved.

Before Phase 5, understand route subscriptions, effect cleanup, runtime contracts, API-specific PR filtering, bounded sampling, cache limits, and truthful test evidence. Development was AI-assisted; explaining/reviewing/testing/changing the actual code are the student's learning activities, distinct from claiming independent authorship of every line.
