# syntax=docker/dockerfile:1
# Quest Board: the production image (deploy/docker-compose.yml runs it as the app and the scheduler).
# One Node process, SQLite on the /data volume (database, uploaded pictures, backups).
#
# Targets: the default (last stage) is production. `docker build --target dev -t questboard-dev .` gives a
# development image with hot reload: docker run -p 3000:3000 -v "$PWD/src:/app/src" questboard-dev
#
# Layer order is for cache hits: package files and `npm ci` first (they change rarely), the code last.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# BuildKit keeps npm's download cache between builds: a changed lock file downloads only what changed.
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS dev
ENV NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
# Standalone output (next.config.ts): .next/standalone holds the server and only the packages it uses —
# no compilers, test tools or development packages.
RUN QUESTBOARD_STANDALONE=1 npm run build

FROM node:24-slim AS production
# Debian's security fixes, installed at build time and before any app file, so this layer is reused until
# the base image changes: the node image is rebuilt only every few weeks, and CI's scan (Trivy) refuses an
# image with a fixable HIGH/CRITICAL finding (round 32: libpcre2). npm (and npx, corepack) aren't used at
# runtime: removed, with the security findings that came with them.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
 && apt-get clean && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && mkdir -p /data && chown node:node /data
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    KEEP_ALIVE_TIMEOUT=130000 \
    QUESTBOARD_SEED=false \
    QUESTBOARD_DB=/data/questboard.db \
    QUESTBOARD_UPLOAD_DIR=/data/uploads \
    QUESTBOARD_BACKUP_DIR=/data/backups
# The server (server.js, its packages, .next/server), the browser files, and what the scheduler and the
# admin commands use: scripts/ with the few src/lib files they import (Node runs .ts directly). On the
# server they run as `node scripts/admin.mjs …`, `node scripts/db-backup.mjs backup`, ….
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/package.json ./package.json
# OCI labels: where the image comes from and which commit it is (CI passes VERSION and REVISION).
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Quest Board" \
      org.opencontainers.image.description="Find tabletop RPG games in Indonesia and reserve a seat with a Game Master" \
      org.opencontainers.image.source="https://github.com/addin12/Quest-Board" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
USER node
VOLUME ["/data"]
EXPOSE 3000
# Liveness: the database answers at the expected schema (the uptime monitor uses /api/health?full=1).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# HOSTNAME=0.0.0.0 above: Docker sets HOSTNAME to the container's id, which the server would listen on.
# KEEP_ALIVE_TIMEOUT: Caddy keeps idle connections to the app for 2 minutes; Node would close them after
# 5 s, and a request sent just as one closes fails (a random 502). The app now waits longer than Caddy.
CMD ["node", "server.js"]
