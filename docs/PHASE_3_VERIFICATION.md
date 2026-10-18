# Phase 3 verification — Issue #4

Executed in Codex Cloud on 2026-10-17. Node 24.19.0, npm 11.9.0, Vite 8.3.4, Vitest 5.0.5, and installed system Chromium. The complete issue body and comments were read before implementation. Root `AGENTS.md` was the only repository agent-instruction file found.

## Branch and scope

`feat/phase-3-search-ui` was created from the fetched `origin/feat/phase-2-github-api` at `a0e559a83fb816e87b1f6d76462aec4e978cef8c`. No dependency branch was merged, rebased, or deleted. ChatGPT handles creating the stacked PR after push; the intended base is `feat/phase-2-github-api`.

Only React search, its tests, styles, and documentation changed. `git diff --exit-code -- backend package.json package-lock.json frontend/package.json` returned exit 0, confirming backend and dependencies were unchanged. Existing installed dependencies were usable, so `npm ci` was not needed or claimed as newly executed.

## Commands and results

| Executed command                                   | Result                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run check`                                    | Exit 0: formatting, lint, frontend/backend type checks, all unit/integration tests, and both builds passed |
| Frontend Vitest within check                       | 2 files, 49 passed: 8 foundation and 41 search/client/state cases                                          |
| Backend Vitest within check                        | 2 files, 101 passed; unchanged Phase 1/2 behavior                                                          |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | Exit 0: 8 passed, final run 10.5s                                                                          |
| Frontend build within check                        | 23 modules; JS 235.35 kB / gzip 73.70 kB; CSS 5.51 kB / gzip 1.84 kB                                       |
| Backend build within check                         | TypeScript compilation passed                                                                              |
| `git diff --check`                                 | No whitespace errors                                                                                       |

Final documentation formatting is checked after writing the lesson and report. No new external testing tool or dependency was introduced, and no new npm audit result is claimed.

## Frontend test coverage

- Explicit submit/Enter semantics, controlled inputs, no search on mount/edit, URL encoding, normalization, language/sort/order/page size.
- Empty, overlong, qualifier-colon, and control-character inputs rejected before requesting.
- All card fields, explicit missing values, safe external link attributes, and rendering HTML-looking descriptions as text.
- Pagination, effective page size, next-page flags, accessible-window validation, filter changes resetting to page 1, and truthful truncation/incomplete messages.
- HTTP 400/404/429/500/502/503/504 messages without exposing arbitrary backend diagnostics; network failure and manual retry.
- Latest retry/reset hint wins, 60-second fallback for malformed/missing rate hints, cooldown blocks submissions and has no automatic retry; HTTP-date maintenance guidance.
- Ten-second timeout before headers and during body parsing; explicit abort distinguished from timeout.
- Duplicate in-flight submissions suppressed; old searches aborted; late success/failure ignored; unmount cancellation.
- Malformed JSON, invalid shapes/counts/metadata, and unsafe, credential-bearing, or mismatched URLs rejected.

## Browser evidence and boundaries

Five search browser tests supplement the three foundation tests:

1. At 390px and 1280px, tests exercise search, filters, Enter submission, cards, previous/next pages, draft changes, and keyboard focus. Long unbroken names/descriptions do not create horizontal overflow.
2. Loading, backend error, retry, and empty-results states are exercised with deterministic route responses.
3. A 429 response pauses search/retry; advancing the local browser clock reenables controls without making a request. Only an explicit retry sends the next request.
4. Empty/oversized searches remain local. A browser test deliberately adds an unsupported query parameter, sends it through the actual Vite proxy and Express route, and verifies HTTP 400 `INVALID_INPUT` and the resulting UI message. Validation rejects this before any GitHub call.
5. Foundation tests still use the real backend health endpoint and verify failed health checks recover.

Axe reported zero violations in the tested homepage/results/loading/error/empty/cooldown states. This includes applicable automated contrast checks, not complete manual accessibility certification. Keyboard assertions cover skip link, Enter submission, pagination, and moving focus to the results heading after a page change.

Search successes/errors are mocked at the browser network boundary. Therefore those tests verify the React HTTP contract but do not prove a new live GitHub search. Real backend health and validation checks, plus the unchanged 101 backend tests, provide complementary evidence. No live GitHub quota was spent on routine search verification.

## Screenshot observations

[390px mobile](screenshots/phase-3-mobile.png) · [1280px desktop](screenshots/phase-3-desktop.png)

Both were captured by Playwright after moving to page 2, then visually inspected. The screenshots show deterministic fixture repository `octocat/project-20`, **not a claimed live search result**. Mobile controls stack into a single column; desktop uses wider rows and a two-column card grid. Labels, health status, last-submitted filters, card metrics, disabled next-page boundary, and visible results-heading focus are legible. Full screenshots including long-text edge cases remain in ignored `test-results/` and can be regenerated.

## Problems found and fixed

- TypeScript caught Playwright's `exact` role-query option accidentally used in Testing Library tests. Removing it from those tests resolved type checking; Testing Library's string accessible-name match is already exact.
- During the pagination-focus edit, lint caught an unconnected `changePage` helper. Wiring both buttons to it resolved lint; browser assertions now verify focus remains on the results heading after pagination.
- Existing foundation tests assumed there was only one status region and a disabled search button. They now scope health assertions correctly and assert the enabled Phase 3 button while retaining their original health/keyboard/accessibility checks.

No unresolved implementation/test blocker remains. Limitations: no physical Android/manual screen-reader testing; no new live GitHub search or deployment verification; rate limits and per-page cooldown persistence remain documented constraints. No paid service, secret, PR merge, PR creation, or Phase 4 implementation is part of this task.
