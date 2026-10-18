# Phase 5 verification — Issue #7 and both owner comments

Executed 2026-10-17 in Codex Cloud; independent hosted workflow conclusions read from GitHub Actions. Cloud Node24.19.0/npm11.9.0, Docker client/server28.4.0/vfs, Compose2.40.3; pinned official runtime image Node24.22.0/npm11.19.1. Local/hybrid work is now permitted, but no laptop result is claimed.

## Exact source and provenance

Base `feat/phase-4-repository-details` at `2f25f7533ddc2ca5e272f3715e7ad93fcadbbfcb`; head `feat/phase-5-engineering`. Implementation checkpoint **`5ebaca4e448c72c93056973c0279ad9cc58d4ebb`** contains the tested production/runtime/security/Docker/workflow source and initial progress report. Subsequent handoff documentation/screenshot commit also makes 429 text neutral for local/upstream limits; final source CI is inspected separately. The final handoff gives the actual final head; this file cannot contain its own future commit hash.

All checks below were actually executed unless marked otherwise. Historical Phases1–4 tests are backfilled in PHASE_PROGRESS from their committed reports, not claimed as independently rerun by ChatGPT. GitHub metadata confirmed PRs1/3/5/8 remain OPEN at their expected full SHAs; no merge/rebase/force-push/deletion or main change occurred. Codex creates no Phase5 PR; ChatGPT will target Phase4.

## Cloud commands and outcomes

| Executed command/check                                    | Actual result                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm ci --cache /tmp/opensource-npm-cache`                | PASS,367 packages installed from frozen lockfile; sequential checks rerun afterward              |
| `npm run check`                                           | PASS: format/lint/types,81 frontend and154 backend tests, both builds                            |
| `npm run test:coverage`                                   | PASS:81/154 tests again, thresholds satisfied; figures below                                     |
| `npm run audit -- --cache /tmp/opensource-npm-cache`      | PASS,0 reported npm vulnerabilities, including dev dependency tree; no OS scan claim             |
| `npm run security:check`                                  | PASS, tracked artifact/common-token/private-key patterns clean; not universal secret detection   |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`        | PASS,13 existing browser tests,14.3s recorded run                                                |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:production` | PASS,5 built Express-served browser tests,5.9s; rerun after cross-platform start entry was added |
| Frontend production build                                 | 27 modules, JS243.48kB/gzip75.73kB, CSS6.55kB/gzip2.03kB; not a traffic benchmark                |
| Backend build                                             | PASS, compiled startup/static/runtime/security/API modules                                       |
| `git diff --check`, staged safety/ignore review           | PASS; generated reports/logs/images tarballs not committed; deliberate docs screenshots retained |
| Final documentation format/lint/link checks               | Run after writing evidence docs; no application change in the evidence-only commit               |

Measured V8 scope excludes test/fixture files and startup entry/mount modules. Backend server entry is exercised by actual production/container starts; frontend mounting is exercised by browsers.

| Scope    | Statements       | Branches         | Functions      | Lines            |
| -------- | ---------------- | ---------------- | -------------- | ---------------- |
| Frontend | 96.46% (327/339) | 94.25% (328/348) | 98.90% (90/91) | 97.33% (292/300) |
| Backend  | 96.96% (351/362) | 95.97% (334/348) | 95.23% (60/63) | 97.93% (332/339) |

Thresholds:90% lines/statements,85% branches/functions. These are aggregate regression gates, not all-path/security proof; runtime/default error and full client-table branches remain partly untested. Raw coverage HTML/JSON/lcov is ignored locally, not uploaded to paid artifact storage.

## Production security/browser evidence

Nineteen original Phase5 production-boundary/lifecycle cases plus a forced-deadline case supplement134 existing backend tests. They cover static/deep routes, API/asset/dotfile/traversal404s, CSP/headers, health/readiness, methods/bodies/URL limits, forwarded-IP spoof resistance, limiter expiry, safe correlation logs, asset preflight and idempotent/forced shutdown. Existing validation/client/cache/UI suites stay passing.

Production Chromium checks at360/390/768/1280 use the actual built React served by Express, never Vite. They verify same-origin API/health/readiness, internal navigation and nested refresh, keyboard focus/skip link, no overflow, reduced-motion behavior, empty contribution state, safe links and zero axe violations. Inline script execution is actively blocked by CSP; API unknown and missing assets remain JSON404, and a built script receives immutable caching. Mocked repository data avoids spending GitHub quota; this phase adds no live GitHub smoke claim.

Reviewed production fixture screenshots: [360px search](screenshots/phase-5-production-search-360.png), [768px details/empty](screenshots/phase-5-production-details-768.png), [1280px details/empty](screenshots/phase-5-production-details-1280.png). All four widths were captured by tests; only meaningful reviewed examples committed. Linux Chromium/axe does not prove native screen-reader/physical Android/performance behavior.

## Docker execution in Codex Cloud

The local-socket check cleared remote selectors (not DOCKER_CONFIG):

```sh
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock info --format 'Server={{.ServerVersion}} Driver={{.Driver}} Containers={{.Containers}}'
```

Observed `Server=28.4.0 Driver=vfs Containers=0`; UID1000 worker had daemon access. Compose reportedv2.40.3. Image/pull/build/run permissions were therefore tested separately from installation.

Executed build:

```sh
BUILDX_CONFIG=/tmp/opensource-buildx docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t opensource-explorer:phase5 .
BUILDX_CONFIG=/tmp/opensource-buildx docker compose -f compose.yaml -f compose.cloud.yaml build
BUILDX_CONFIG=/tmp/opensource-buildx docker compose -f compose.yaml -f compose.cloud.yaml up -d --wait --wait-timeout 60
node scripts/smoke-production.mjs http://127.0.0.1:8080
```

Commands used the local-socket/cleared-selector prefix where needed. TLS verification remained enabled; optional CA was a secret mount in both install stages and read-only runtime overlay. Node image index pinned to `sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`. Verified checkpoint local image ID `sha256:53bf9a52343d4ac8457f752b3c0e50021b9bdaad9f24c43f9c411d3c8c8260ce`; image IDs can differ across builds/tool timestamps, so bit-identical images are not claimed.

Actual Compose output reached **Healthy**. The smoke verified:

```text
/api/health 200 json
/api/ready 200 json
/ 200 html
/repositories/octocat/Hello-World 200 html
/api/unknown 404 json
/assets/missing.js 404 json
```

Each response had production CSP; HTML contained React root and its script asset loaded successfully with immutable caching. `compose exec` reported `uid:1000`, `version:v24.22.0`, `port:3001`; `/app` write attempt returned **EROFS**. `compose stop` exited0, with shutdown/stopped logs. Containers/network were removed afterward.

A separate direct `docker run` used `--read-only --cap-drop=ALL --security-opt=no-new-privileges:true --tmpfs /tmp:size=16m -e PORT=4000 -p127.0.0.1:8081:4000`. The same six checks passed, UID1000/PORT4000 confirmed, SIGTERM stop exited0 and logged stopped. Final Compose was also exercised against the rebuilt local tag. No user public deployment or image push occurred.

Image inspection found USER node and no proxy/token/password/secret/certificate variable names baked in image ENV; history showed no session proxy/token assignments. Runtime filesystem check found no Git history/env/source/secret CA/typescript/coverage module paths, and Express production dependencies present. This verifies selected packaging boundaries, not OS-CVE absence.

## Actual GitHub Actions evidence

Repository visibility was confirmed PUBLIC. Standard ubuntu-latest only, contents:read, checkout/setup-node SHA pins, no persisted checkout token, no deployment/publish/artifact-upload steps. No paid runner/registry/scanner activated.

**PASS:** [Engineering run39051249057](https://github.com/AliSherLeghari/new-project-reactjs-nodejs/actions/runs/39051249057), event push, head **5ebaca4e448c72c93056973c0279ad9cc58d4ebb**. Both jobs completed successfully:

- [quality](https://github.com/AliSherLeghari/new-project-reactjs-nodejs/actions/runs/39051249057/job/117450121248): npm ci, check, coverage, repository scan, audit, Chromium install, development and production browsers all SUCCESS (16:51:48–16:53:10UTC).
- [docker](https://github.com/AliSherLeghari/new-project-reactjs-nodejs/actions/runs/39051249057/job/117450121352): daemon info, plain Compose build/healthy up, HTTP smoke, non-root/read-only, graceful stop assertion and cleanup all SUCCESS (16:51:48–16:52:23UTC).

Codex inspected run/job/step conclusions with `gh run list`/`gh run view --json ...`. **Raw log download was blocked**: `gh run view ... --log` redirected to `results-receiver.actions.githubusercontent.com`, which returned403 Forbidden under cloud policy. No signed URL/credentials copied into docs. The Actions settings API also returned integration403, but actual run/step metadata remained readable and proved execution. Detailed cloud test counts/coverage are quoted as cloud evidence; exact hosted log output/advisory count is not fabricated. GitHub web/laptop review of the run links is the independent fallback.

The final handoff commit may trigger another run. Its SHA/result cannot appear in a file before that commit exists; see final handoff/latest branch checks. The linked successful implementation run is durable evidence for the verified implementation checkpoint. PRs on older stacked refs do not automatically inherit it; no merge was needed for this push run.

## Defects found and fixed

1. Read-only `/home/agent/.docker/buildx`: used BUILDX_CONFIG under/tmp while preserving Docker registry/proxy configuration.
2. Initial Docker non-root start failed reading a600 manifest; a chmod-copy attempt also made the parent directory644. Explicit backend directory755 and manifest644 fixed it; actual healthy/non-root/HTTP/stop checks then passed.
3. Immediate direct-container smoke raced Node startup. Added a bounded readiness wait (local health only) before assertions.
4. A clean npm ci overlapped an initial browser attempt, replacing modules while workers loaded (3 failed/10 unrun and production CLI error). After installation completed, all checks/browsers ran sequentially and passed; no assertions were disabled.
5. Generated coverage JavaScript initially entered lint. Coverage directories are now excluded from ESLint/Prettier/Git/Docker context.
6. The final handoff also makes 429 text neutral for local REQUEST_LIMITED and GitHub RATE_LIMITED responses, with a regression test that local admission must not be blamed on GitHub; final frontend count is81 versus checkpoint80.
7. Initial formatting check required a second pass for app.ts; final checks passed. No TLS/checksum/signature bypass or secret inspection was used.

## Release limitations and next actions

See DEPLOYMENT_READINESS for PASS/BLOCKED/NOT TESTED gates. No public hosting/TLS/proxy/cost eligibility, native assistive/performance, OS-image CVE scan or laptop run is claimed. Ingress/cache are bounded local mitigations, not distributed quota or DDoS guarantees. API signatures/client contract remain compatible; ready endpoint and safe boundary error codes are added.

Use OPERATIONS for optional independent laptop/CI reproduction: verify daemon, build, healthy up, HTTP deep-link/asset smoke, UID/read-only check, graceful exit0 and cleanup. Docker/CI are no longer cloud execution blockers; raw hosted logs are the explicit remaining access limitation. Owner/ChatGPT review, integration approval, current genuinely-free host/transport checks and Phase6 authorization remain blocked separately. No merge/deployment/Phase6 was begun.
