# Project status

## Phase 4 — Repository details and contribution issues (Issue #6)

Branch `feat/phase-4-repository-details` begins at Phase 3 commit `2d4e39bc9accc59409fcfa2f2b22a3722d0f8424`. Existing dependency branches/PRs remain unmerged. ChatGPT handles opening the stacked PR with base `feat/phase-3-search-ui` after this branch is pushed.

Implemented:

- Shareable `/repositories/:owner/:repo` pages using the existing Express detail endpoint, History API navigation, direct refresh, back/forward, focus/title updates, and preserved in-memory search results.
- Safe repository metadata, distinct internal/external actions, loading/not-found/error/timeout/manual-retry states, stale cancellation, shared detail/issue cooldown, and StrictMode duplicate-request protection.
- Bounded public contribution issues via `GET /api/repositories/:owner/:repo/issues`, two allowlisted labels, public visibility checks, PR exclusion, runtime contracts, safe links, and the existing 60-second/100-entry cache.
- Compact search-first layout, restrained borders/spacing, responsive cards/details, visible focus, labeled controls, and explicit sample/maintainer-label limitations.
- `.gitignore` protections for build metadata, editor/OS files, and temporary/backup files. No dependency package or service was added.

## Verified evidence

- `npm run check`: formatting, lint, both workspace type checks, 80 frontend tests, 134 backend tests, and both production builds passed.
- Chromium: 13 passed, including the existing eight tests plus five Phase 4 browser tests; zero axe violations in tested states.
- Actual search/details screenshots reviewed at 390px and 1280px, plus mobile empty and not-found states, saved under `docs/screenshots/` with fixture-data labeling.
- Manual built-module/Express smoke against public `microsoft/vscode` returned 10 open good-first issues; repeated request used cache. Exactly two upstream calls occurred: public repository metadata and the issue list. No app Authorization header; quota 15,000 suggests platform proxy authentication, so truly anonymous wire access is not proven.
- Tracked-file/ignore checks found no generated outputs, environment-secret files, or common token/private-key patterns. No new install/audit or physical Android result is claimed.

See [verification](PHASE_4_VERIFICATION.md) and [Lesson 4](learning/LESSON_04_REPOSITORY_DETAILS.md) for actual commands, architecture, functions, tests, and tradeoffs.

## Remaining limitations

1. Contribution lists are only the first 10 recently updated matching entries before PR/nonmatching-label filtering; no completeness or contribution-acceptance guarantee.
2. Public GitHub quotas/secondary limits/shared IP constraints remain. The cache is process-local and does not coalesce simultaneous misses or coordinate multiple instances.
3. Cooldowns are in memory in the current search/detail experience; they do not persist across refreshes or coordinate tabs/screens. The backend remains authoritative.
4. Search state survives internal navigation but resets on full refresh. Production hosting will need SPA fallback and separate API routing; no deployment is activated.
5. Redirects fail closed. Moved repositories or disabled/restricted issue trackers can return unavailable/not-found errors.
6. Chromium/axe checks do not certify physical Android performance or complete screen-reader compatibility.
7. No authentication, database, bookmarks, CI/Actions, paid service, or Phase 5 work was added.

## Android next step

Review the pushed branch, screenshots, verification report, and Lesson 4 in GitHub Mobile or Android Chrome. ChatGPT can create the stacked PR onto `feat/phase-3-search-ui`. Approve each dependency separately; no merge or later phase is automatic.
