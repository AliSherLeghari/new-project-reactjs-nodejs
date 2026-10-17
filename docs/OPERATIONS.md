# Development, verification, and operations runbook

Cloud-first and local/hybrid work are permitted by Issue #7 comments. Docker runs on Codex Cloud, CI or a laptop with an eligible engine, never as a prerequisite on a phone. No deployment or image publication is authorized here.

## Fresh clone / Node workflow

Use Node24.x and npm with the committed lockfile. Cloud was checked with Node24.19.0/npm11.9.0; the pinned official image reports Node24.22.0/npm11.19.1. Both builds worked; do not silently switch majors.

```sh
git clone https://github.com/AliSherLeghari/new-project-reactjs-nodejs.git
cd new-project-reactjs-nodejs
git switch feat/phase-5-engineering
npm ci --cache /tmp/opensource-npm-cache
npm run check
npm run test:coverage
npm run audit -- --cache /tmp/opensource-npm-cache
npm run security:check
```

In a normal laptop directory `npm ci` can use the default cache. Do not run installation simultaneously with tests/builds: npm ci replaces node_modules. On a restricted cloud worker, `/tmp/opensource-npm-cache` avoids the read-only home.

Development: `NODE_USE_ENV_PROXY=1 npm run dev` in Codex Cloud preserves the managed HTTPS proxy and CA trust. A normal local environment can use `npm run dev`. Vite5173 proxies API to Express3001. Stop the managed process you started with Ctrl+C.

Production without Docker:

```sh
npm run build
npm start
```

Root `npm start` uses a cross-platform JS entry to force production mode; it serves the built UI/API on PORT3001 by default. Raw `npm run start -w backend` runs the backend entry and only enables static production mode with NODE_ENV=production. To customize a POSIX shell: `PORT=4000 npm start`; PowerShell: `$env:PORT='4000'; npm start`. `.env.example` is documentation and is not auto-loaded. Build first; missing production assets fail startup safely.

Run browser checks after installation/build, not concurrently with npm ci:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
CHROMIUM_PATH=/usr/bin/chromium npm run test:production
```

The above system path is for this Linux cloud worker. On a laptop/CI use `npx playwright install --with-deps chromium` where appropriate, then `npm run test:e2e` and `npm run test:production` without CHROMIUM_PATH. Browser tests start/stop their own dev or production server and use mocked GitHub responses. Do not leave conflicting processes on 5173/3001/3105. No live API smoke is part of CI.

## Docker / Compose, normal host or optional laptop

Docker Engine and Compose are open source; use an eligible free installation. Docker Desktop is optional and has its own licensing terms: personal/education use may qualify; paid business features/subscriptions are not required or activated by this project. Verify current eligibility before choosing it. WSL2/Linux Engine is another option. No Docker account or paid registry is required for these local image tags; public registry anonymous rate limits can still block pulls.

```sh
docker --version
docker info --format 'Server={{.ServerVersion}}'
docker compose version
docker compose build
docker compose up -d --wait --wait-timeout 60
node scripts/smoke-production.mjs http://127.0.0.1:8080
docker compose exec -T app node -e "console.log(process.getuid());if(process.getuid()===0)process.exit(1)"
docker compose stop
docker inspect --format '{{.State.ExitCode}}' "$(docker compose ps -aq app)"
docker compose down --remove-orphans
```

On PowerShell, command substitution syntax is also supported, but separate the `docker compose ps -aq app` and `docker inspect` steps if shell quoting differs. Expected: daemon server exists, app becomes Healthy, six HTTP checks pass, UID1000, graceful exit0. Never infer readiness from `docker --version` or a container ID. These are optional independent laptop verification steps; they were already executed in cloud, not a claim they ran on the owner's laptop.

Compose publishes only host loopback8080 → app3001. `APP_PORT=8082 docker compose up ...` changes the host port; the app still uses3001. To test another **container** port, use `docker run -e PORT=4000 -p 127.0.0.1:8081:4000 ...`; image healthcheck reads PORT. Use a unique local name, `--read-only --cap-drop=ALL --security-opt=no-new-privileges:true --tmpfs /tmp:size=16m`, then the same smoke script on host8081, stop and inspect exit0.

## Docker in this managed cloud

Keep platform Docker registry/proxy settings. The local daemon health check intentionally clears remote endpoint/context/TLS selectors without changing DOCKER_CONFIG:

```sh
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock info
```

Buildx's normal home directory is read-only here; `BUILDX_CONFIG=/tmp/opensource-buildx` selects writable builder state without replacing registry credentials. The worker provides CODEX_PROXY_CERT (public CA path). Never print credential/config files or turn off TLS checks.

```sh
BUILDX_CONFIG=/tmp/opensource-buildx docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t opensource-explorer:phase5 .
BUILDX_CONFIG=/tmp/opensource-buildx docker compose -f compose.yaml -f compose.cloud.yaml build
BUILDX_CONFIG=/tmp/opensource-buildx docker compose -f compose.yaml -f compose.cloud.yaml up -d --wait --wait-timeout 60
node scripts/smoke-production.mjs http://127.0.0.1:8080
BUILDX_CONFIG=/tmp/opensource-buildx docker compose -f compose.yaml -f compose.cloud.yaml stop
BUILDX_CONFIG=/tmp/opensource-buildx docker compose -f compose.yaml -f compose.cloud.yaml down --remove-orphans
```

These commands use the verified default local daemon. If inherited selectors point elsewhere, apply the same `env -u ... docker --host=...` prefix as in the daemon check. The cloud overlay mounts the CA read-only at runtime and passes it via a BuildKit secret during npm network steps. Predefined Docker proxy args are not copied into ENV layers. Outside this worker use compose.yaml alone; do not invent CODEX_PROXY_CERT or bake a session certificate into the image.

If socket info fails, report daemon/socket/UID evidence rather than installing a privileged daemon as a non-root worker. If a registry/pull/policy/CA check fails, keep its exact error and resolve through supported configuration; no insecure TLS, paid account, or bypass. Laptop/CI can independently validate later, but blocked cloud checks must stay BLOCKED/NOT TESTED until actually executed.

## Health, logs, shutdown, and troubleshooting

- `GET /api/health` is process liveness; `GET /api/ready` checks draining state and the production index. Neither calls GitHub or proves upstream quota.
- Each request gets a fresh X-Request-ID; logs include event, ID, method, web/API surface, status and duration. No IP, owner/repo/query/body/token/raw exception is logged. `docker compose logs --tail=50` or host stdout can correlate requests; keep large logs out of Git.
- SIGTERM/SIGINT drain, close idle/listening sockets, then force exit1 at ten seconds if stuck. Compose allows twelve seconds. Normal container stop was observed exit0. A killed process/exit137 is not graceful success.
- `startup_failed`: check build outputs, Node24, PORT/GITHUB_TIMEOUT_MS settings and file read permissions. `listen_failed` safely reports EADDRINUSE/EACCES where appropriate. Do not dump environment values for diagnosis.
- API404 is JSON even if Accept is HTML. Missing assets are404, not index.html. Only supported frontend routes get SPA fallback. If a future host breaks nested refresh, fix its routing rather than enabling catch-all API HTML.
- HTTP429 REQUEST_LIMITED is our ingress policy; RATE_LIMITED is GitHub's mapped error. Respect Retry-After and reduce traffic. Larger cloud-proxy quotas are not anonymous guarantees.
- Production403/CSP errors: check same-origin built asset paths, avoid adding unsafe-inline/eval/CORS wildcards as shortcuts. Cloud GitHub502 with certificate/network errors requires supported proxy/CA setup.
- Non-root image permission errors: check directory execute/read and manifest read modes. The Dockerfile explicitly sets backend directory755 and manifest644; root-owned code plus read-only runtime should remain.

## CI, evidence, and ongoing updates

`.github/workflows/engineering.yml` has standard public Ubuntu `quality` and `docker` jobs, SHA-pinned first-party actions, contents:read, no persisted checkout credentials, concurrency cancellation and20-minute job limits. It runs on push/PR for main and feat/**. A push can run the workflow from the new branch before any merge. Older stacked heads without the workflow do not magically gain checks; new pushes/PR events and available merge refs/permissions govern their runs. Fork workflows may need approval. No workflow_dispatch/default-branch assumption is used to bypass that.

Only logs/cache are used, no uploaded artifacts, paid runner/scanner, registry push or deploy. `npm audit --audit-level=high` blocks reported high/critical findings and still prints lower findings; triage them rather than suppressing. V8 reports are ignored locally; aggregate figures/coverage scopes are committed in verification, not HTML. A successful hosted run proves that exact head/event only; later documentation commits must identify the source run and final-head timing.

Update PHASE_PROGRESS, the phase verification, PROJECT_STATUS and actual-code lesson with every implementation task. Record failures and remaining review gates. Build creates artifacts; run executes them; deploy publishes to a host. This phase performs the first two and delivery checks only.
