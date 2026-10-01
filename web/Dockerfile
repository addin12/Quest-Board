# Quest Board: the production image (deploy/docker-compose.yml runs it as the app and the scheduler).
# One Node process, SQLite on the /data volume (database, uploaded pictures, backups).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Standalone output (next.config.ts): .next/standalone holds the server and only the packages it uses —
# no compilers, test tools or development packages.
RUN QUESTBOARD_STANDALONE=1 npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    QUESTBOARD_SEED=false \
    QUESTBOARD_DB=/data/questboard.db \
    QUESTBOARD_UPLOAD_DIR=/data/uploads \
    QUESTBOARD_BACKUP_DIR=/data/backups
# The server (server.js, its packages, .next/server), the browser files, and what the scheduler and the
# admin commands use: scripts/ with the few src/lib files they import (Node runs .ts directly), and
# package.json for `npm run admin`, `npm run db:backup`, ….
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
# Liveness: the database answers at the expected schema (the uptime monitor uses /api/health?full=1).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# HOSTNAME=0.0.0.0 above: Docker sets HOSTNAME to the container's id, which the server would listen on.
CMD ["node", "server.js"]
