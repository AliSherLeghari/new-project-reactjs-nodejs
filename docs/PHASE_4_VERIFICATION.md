# Phase 4 verification — Issue #6

Executed in Codex Cloud on 2026-10-17 with Node 24.19.0, npm 11.9.0, Vite 8.3.4, Vitest 5.0.5, and system Chromium. Complete issue body/comments and repository instructions were read first.

## Branch and scope

`feat/phase-4-repository-details` was created from fetched `origin/feat/phase-3-search-ui` at exactly `2d4e39bc9accc59409fcfa2f2b22a3722d0f8424`. No force-push/rebase/deletion/merge or main change was performed. ChatGPT will create the stacked PR with base `feat/phase-3-search-ui`; Codex commits/pushes only.

Implemented shareable details, bounded contribution issues, compact UI, tests/docs, and ignore housekeeping. No package/dependency/lockfile changes, router package, paid service, token, database, hosting, Actions, or Phase 5 work. Existing installed dependencies were usable; no new install/audit result is claimed.

## Commands and actual outcomes

| Executed check                                       | Result                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run check`                                      | Exit 0: format/lint, both workspace type checks, all tests, both builds      |
| Frontend Vitest                                      | 3 files, 80 passed (49 prior + 31 detail/routing/client/resource tests)      |
| Backend Vitest                                       | 3 files, 134 passed (101 prior + 33 contribution-issue tests)                |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`   | Exit 0; 13 passed, final run 14.7s                                           |
| Frontend build                                       | 27 modules; JS 243.49 kB / gzip 75.73 kB; CSS 7.28 kB / gzip 2.22 kB         |
| Backend build                                        | Production TypeScript compilation passed                                     |
| `NODE_USE_ENV_PROXY=1 node scripts/smoke-issues.mjs` | Exit 0; two local issue requests succeeded, only two upstream requests total |
| `git diff --check`                                   | No whitespace errors                                                         |
| Dependency manifest/lockfile diff                    | Exit 0; no changes                                                           |
| `git ls-files -ci --exclude-standard`                | Empty; no tracked ignored artifacts                                          |
| Tracked path and token/private-key pattern scan      | No matches; checked paths/content without printing credential values         |

Final documentation/script formatting/lint checks are performed after writing these reports. Captured build/test outputs above are from actual completed runs, not proposed commands.

## Routine test evidence

Backend tests cover fixed open/label/page/limit/sort parameters, allowlists, invalid names, visibility rejection before issue access, PR/nonmatching-label filtering, exact normalized contracts, malformed JSON/unsafe URLs, upstream 404/403/429/500, timeouts, rate guidance, failure non-caching, TTL/case/label cache behavior, and capacity shared with repository data.

Frontend tests cover internal/external links, direct URL/remount, history back/forward, preserved search, malformed routes, loading/missing metadata, safe links, label changes/empty states, detail and issue errors/retry, rate cooldown/no automatic retry, request timeout, stale/unmounted cancellation, StrictMode request counts, and malformed/unsafe contracts. The unchanged search/health tests remain passing.

Browser tests preserve the existing eight checks and add five Phase 4 cases. Mobile 390px and desktop 1280px flows verify the query field is in the first viewport, internal keyboard navigation, detail focus/title, issue filters, no per-card issue fetch, browser back/forward, refresh/direct URLs, no overflow, and safe links. Error cases cover unknown paths, repository 404, recoverable issue 502, and rate-limited details with no premature issue request. A real Express invalid-owner issue request returns 400 before GitHub access; the health endpoint remains real too.

Axe scans reported zero violations for tested search/details/empty/not-found/error states and existing loading/cooldown states. Automated contrast/focus checks do not establish full screen-reader or physical Android compatibility. Browser search/detail/issue success fixtures are deterministic mocks; they do not prove live GitHub availability.

## Manual live public-issues evidence

The optional script uses built backend modules, starts a temporary Express listener, calls our issue endpoint for public `microsoft/vscode` twice, and closes its listener. It has no retry loop. Safe observed output:

```json
{
  "firstRequest": {
    "status": 200,
    "label": "good-first-issue",
    "limit": 10,
    "count": 10,
    "first": {
      "number": 256854,
      "state": "open",
      "url": "https://github.com/microsoft/vscode/issues/256854"
    }
  },
  "secondRequest": { "status": 200, "count": 10 },
  "upstreamObservations": [
    {
      "path": "/repos/microsoft/vscode",
      "status": 200,
      "resource": "core",
      "limit": "15000",
      "remaining": "14947",
      "reset": "1792253400"
    },
    {
      "path": "/repos/microsoft/vscode/issues",
      "status": 200,
      "resource": "core",
      "limit": "15000",
      "remaining": "14946",
      "reset": "1792253400"
    }
  ],
  "cachedRepeatAvoidedRequests": true,
  "applicationAuthorizationHeader": false
}
```

The script asserted the open state, bound of ten, matching issue URL, and exactly two upstream calls. The observed issue could change/close later. Live rate exhaustion/outages were not induced; mocks verify those cases without wasting quota.

No application Authorization header was sent or token required. The observed 15,000 quota suggests platform-proxy authentication; truly anonymous outbound access is not independently proven. No credentials were extracted or controls bypassed. Normal free anonymous quotas (generally 60/hour/IP with separate search/secondary/shared-IP limits) remain documented, and no paid capacity was activated.

## Reviewed screenshots

All were captured from actual browser runs and visually inspected. They show labeled deterministic fixture data (`octocat/project-0`, issue #42), not a claimed live fixture repository.

- [Search mobile](screenshots/phase-4-search-mobile.png) and [search desktop](screenshots/phase-4-search-desktop.png): compact heading, first-screen query, aligned controls, distinct detail action, no giant hero/decorative badge.
- [Details mobile](screenshots/phase-4-details-mobile.png) and [details desktop](screenshots/phase-4-details-desktop.png): owner/counts, visible keyboard focus, contribution filter/caveats, readable issue card and safe browse link, no sideways overflow.
- [Empty issues mobile](screenshots/phase-4-empty-mobile.png): constructive empty state and matching GitHub browse action.
- [Not found mobile](screenshots/phase-4-not-found-mobile.png): clear failed repository state with manual retry and search navigation.

Only these deliberate documentation images were copied into tracked `docs/screenshots/`; raw Playwright outputs remain ignored.

## Problems discovered and resolved

1. Initial hook lint rejected conditional/spread effect dependencies. Explicit stable route fields now drive title/focus effects.
2. Browser tests exposed development StrictMode setup/cleanup duplicating resource calls, which also hid the first mocked error. The hook now defers loading a microtask and skips discarded effects; a StrictMode regression test verifies one detail/issue request each.
3. That deferral required controlled-promise tests to wait until the mock request actually began before resolving/cancelling it. The tests now synchronize on that event.
4. A browser focus assertion used Testing Library's matcher; changed to Playwright's `toBeFocused`.
5. Preserved hidden search content made an unscoped text locator match both old cards and active metadata. The assertion now scopes to the active Repository information region. Existing search links are also queried by their distinct external action name.

## Housekeeping and remaining limits

Added ignore rules for `*.tsbuildinfo`, `.idea/`, `.vscode/`, `.DS_Store`, `Thumbs.db`, `*.tmp`, and `*.bak`; checked representative paths with `git check-ignore -v`. Lockfile, code/tests, AGENTS.md, `.env.example`, and deliberate screenshots remain trackable. No tracked generated outputs/environment secrets/common token patterns were found. A pattern scan is useful evidence, not a universal proof against all possible secret formats.

No unresolved implementation/test blocker remains. The list is a bounded sample, maintainer labels are not guarantees, public cache/quota state is process-local, concurrent misses are not coalesced, cooldown/search state are not persisted, and already-started backend upstream calls may finish after browser cancellation. Renamed repositories fail closed on redirects, and disabled/restricted issue trackers can be unavailable. Production SPA/API routing and physical Android/manual assistive testing remain unverified. No Phase 5 or merge is authorized by this work.
