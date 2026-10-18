# Project status

## Phase 2: backend GitHub integration

Implemented against GitHub Issue #2 on `feat/phase-2-github-api`, based on Phase 1 commit `29b819043c4b0527dca9b005a7ec02656654fa95`.

- Phase 1 PR #1 remains open and unmerged. Phase 2 has a stacked dependency and targets `feat/phase-1-foundation` for a focused review.
- Backend repository search and detail routes are implemented with validated/normalized input and output, GitHub error mapping, timeouts, and a bounded success-only TTL cache.
- Phase 1 health endpoint, frontend source, UI behavior, and browser test source remain unchanged. Search controls still do not call the backend search route.
- Full checks passed: 101 backend tests, 8 frontend tests, 3 Chromium browser tests, lint, formatting, type checks, and both builds.
- Live search and detail requests passed through Codex Cloud. The application sends no Authorization header, but observed quotas indicate possible platform proxy authentication. Truly anonymous outbound GitHub access is not independently proven.
- No dependencies were added; no paid services, personal tokens, Actions, deployment, database, or authentication were introduced.

See [verification](PHASE_2_VERIFICATION.md) and [Lesson 2](learning/LESSON_02_GITHUB_API.md).

## Remaining limitations

1. Search is backend-only. Phase 3 UI integration is not started.
2. Cache is in memory per process, lasts 60 seconds, holds 100 entries, and does not coordinate concurrent misses or quotas across instances.
3. Search totals can be approximate/incomplete and only the first 1000-result window is usable. Page size can leave a partial final window inaccessible.
4. GitHub rate limits still apply. No automatic retries or background polling are configured.
5. Automated Chromium/axe checks do not constitute physical Android or full screen-reader testing.
6. Production hosting/routing and CI remain later phases, subject to verified zero-cost requirements.

## Student review sequence (Android)

Open the Phase 2 PR in GitHub Mobile or Chrome, read the summary, then read `docs/learning/LESSON_02_GITHUB_API.md`. Review `validation.ts`, `service.ts`, `client.ts`, and the corresponding tests. Ask Codex to explain one request end to end. Do not merge either PR until you explicitly approve it. Retarget Phase 2 after Phase 1 is merged; approval for one PR does not authorize merging another.
