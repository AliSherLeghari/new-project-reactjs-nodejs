# Project instructions

- Build only the user-authorized phase. Do not merge without explicit approval.
- Work in the existing Codex Cloud checkout; do not create worktrees unless requested.
- Use npm workspaces, React/TypeScript/Vite, and Express/TypeScript. Keep architecture simple.
- Use only free open-source dependencies. No paid services, cards, purchases, or billable usage. Verify service terms before activation.
- Work cloud-first; local/hybrid VS Code, terminals, native browsers, Docker/Compose, and actual-device verification are permitted by Issue #7 owner comments. Do not delay independent cloud work while waiting for laptop access.
- Never commit secrets or generated outputs. The MVP requires no GitHub PAT.
- Run `npm run check` and relevant browser tests after meaningful changes. Report actual results and limitations.
- In this cloud sandbox use `npm ci --cache /tmp/opensource-npm-cache`.
- Start both services with `NODE_USE_ENV_PROXY=1 npm run dev` in Codex Cloud; preserve inherited proxy/CA settings. Frontend port 5173 proxies `/api` to backend port 3001.
- For browser tests here use `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` if that browser exists.
- Add an actual-code lesson under `docs/learning/` for each phase, including architecture, examples, tests, limitations, interview Q&A, and exercises.
- Keep GitHub changes in a feature branch and reviewable PR; never claim an unexecuted check passed.

- Phase 5 implements production engineering. Phase 6/deployment and later work remain deferred until explicitly authorized. See `docs/PROJECT_STATUS.md`.
- Phase 5 is stacked on `feat/phase-4-repository-details`; do not merge/rebase/delete dependency branches or force-push. ChatGPT manages PR creation after the Phase 5 branch is pushed.
- Search tests must use deterministic fixtures and avoid unnecessary live GitHub quota. Preserve cancellation, stale-response guards, safe URL checks, and rate-limit cooldowns.
- Live smoke checks are optional: after building, `NODE_USE_ENV_PROXY=1 node scripts/smoke-github.mjs` makes at most two GitHub requests. Ordinary tests stay mocked and token-free.

- Contribution issues must use allowlisted labels, public repository checks, fixed GitHub hosts, bounded requests/cache, and explicit pull-request exclusion. Preserve safe URLs, cancellation, and manual retry/cooldown.
- Optional live issue smoke after build: `NODE_USE_ENV_PROXY=1 node scripts/smoke-issues.mjs`; routine tests remain mocked. Only intentionally documented screenshots belong in Git.

- Permanent completion gate: every future phase or implementation-changing prompt MUST update `docs/PHASE_PROGRESS.md` in the same commit(s), plus its phase-specific verification report. Record goal/status separately from merge status, issue/PR/base/head/full implementation SHA/predecessor, actual changed files/functions, requirements/decisions/dependencies/cost/security, exact commands/environment/date/results/CI URLs, defects/fixes/screenshots/limits/outstanding work, and the actual-code lesson. Never claim ChatGPT reran Codex tests. Explain final documentation SHA timing rather than inventing a self-referential SHA.
- [docs/PHASE_PROGRESS.md](docs/PHASE_PROGRESS.md) is the repository-visible journal; `docs/PROJECT_STATUS.md` is the current snapshot. Preserve prior phase reports/lessons. Phase 6/deployment and merges require explicit approval.
