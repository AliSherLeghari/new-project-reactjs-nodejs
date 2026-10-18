# Project instructions

- Build only the user-authorized phase. Do not merge without explicit approval.
- Work in the existing Codex Cloud checkout; do not create worktrees unless requested.
- Use npm workspaces, React/TypeScript/Vite, and Express/TypeScript. Keep architecture simple.
- Use only free open-source dependencies. No paid services, cards, purchases, or billable usage. Verify service terms before activation.
- All user steps must work on Android via ChatGPT, GitHub, or Chrome. Never require a local terminal.
- Never commit secrets or generated outputs. The MVP requires no GitHub PAT.
- Run `npm run check` and relevant browser tests after meaningful changes. Report actual results and limitations.
- In this cloud sandbox use `npm ci --cache /tmp/opensource-npm-cache`.
- Start both services with `NODE_USE_ENV_PROXY=1 npm run dev` in Codex Cloud; preserve inherited proxy/CA settings. Frontend port 5173 proxies `/api` to backend port 3001.
- For browser tests here use `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` if that browser exists.
- Add an actual-code lesson under `docs/learning/` for each phase, including architecture, examples, tests, limitations, interview Q&A, and exercises.
- Keep GitHub changes in a feature branch and reviewable PR; never claim an unexecuted check passed.

- Phase 2 adds backend-only GitHub integration; keep frontend search deferred until authorized. See `docs/PROJECT_STATUS.md`.
- Live smoke checks are optional: after building, `NODE_USE_ENV_PROXY=1 node scripts/smoke-github.mjs` makes at most two GitHub requests. Ordinary tests stay mocked and token-free.
