# Project status

## Phase 3 — React search experience (Issue #4)

Branch: `feat/phase-3-search-ui`, based on Phase 2 commit `a0e559a83fb816e87b1f6d76462aec4e978cef8c` from `feat/phase-2-github-api`.

Implemented controlled search, language/sort/order/page-size filters, repository cards, bounded pagination, loading/empty/validation/error states, manual retry, and rate-limit cooldown. The client validates external JSON and GitHub URLs, cancels superseded requests, ignores stale completions, and makes no browser-direct GitHub requests. The existing health indicator remains intact.

The backend and dependency manifests/lockfile are unchanged. No packages, tokens, paid services, deployment, or Actions were added. No existing PR was merged. ChatGPT will create the Phase 3 stacked PR onto `feat/phase-2-github-api`; Codex only commits/pushes this phase.

## Verified evidence

- `npm run check`: formatting, lint, both type checks, 49 frontend tests, 101 backend tests, both production builds passed.
- Chromium: 8 browser tests passed. They cover 390px/1280px layout, keyboard controls, pagination focus, overflow, axe scans, health/error recovery, search/filters/pagination, loading/error/empty states, cooldown, and real backend input rejection.
- Routine tests used controlled search data. No fresh live GitHub search claim is made for Phase 3. Phase 2's live verification remains a historical record with its platform-proxy authentication caveat.
- Mobile and desktop screenshots were visually reviewed and saved under `docs/screenshots/`; they contain clearly documented test fixtures.

See [verification](PHASE_3_VERIFICATION.md), [Lesson 3](learning/LESSON_03_REACT_SEARCH.md), and the README for commands and behavior.

## Remaining limits

- Repository links open GitHub. An in-app detail view is Phase 4 and is not implemented.
- Search totals/order may change; GitHub's search window and incomplete-result flags still limit pagination.
- Backend cache remains process-local, 60-second TTL, 100 entries; no distributed quota control.
- Cooldown lives in the mounted browser page and is not persisted across refreshes/tabs. The backend remains the authority for quota errors.
- The frontend timeout is 10 seconds even if an operator configures a longer backend timeout.
- No URL-synchronized search state, persistence, bookmarks, account, or automatic polling.
- Browser checks use Linux Chromium, not physical Android or full manual screen-reader testing.
- Production hosting/routing and CI remain future authorized phases with zero-cost checks required.

## Android review

Open the pushed branch in GitHub Mobile or Chrome. Read Lesson 3, inspect `SearchExplorer.tsx`, `useRepositorySearch.ts`, `api.ts`, and the tests. ChatGPT can then open the stacked PR with base `feat/phase-2-github-api`. Do not merge dependencies or begin Phase 4 without explicit approval.
