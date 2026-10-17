# syntax=docker/dockerfile:1
# Official Node 24 LTS multi-platform index, resolved 2026-10-17. Refresh deliberately; see ADRs.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
# Cloud CA is optional outside Codex; secret mounts and predefined proxy args never become ENV layers.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true --no-audit --no-fund
COPY tsconfig.base.json ./
COPY frontend ./frontend
COPY backend ./backend
FROM dependencies AS frontend-build
RUN npm run build -w frontend
FROM dependencies AS backend-build
RUN npm run build -w backend
FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --workspace=backend --ignore-scripts --strict-ssl=true --no-audit --no-fund
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY backend/package.json ./backend/package.json
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN chmod 755 /app/backend && chmod 644 /app/backend/package.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/ready',{signal:AbortSignal.timeout(2000)}).then(async r=>{if(!r.ok||(await r.json()).status!=='ready')process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "backend/dist/server.js"]
