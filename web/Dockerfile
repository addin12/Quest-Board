# Quest Board: the production image (deploy/docker-compose.yml runs it as the app and the scheduler).
# One Node process, SQLite on the /data volume (database, uploaded pictures, backups).

FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    QUESTBOARD_SEED=false \
    QUESTBOARD_DB=/data/questboard.db \
    QUESTBOARD_UPLOAD_DIR=/data/uploads \
    QUESTBOARD_BACKUP_DIR=/data/backups
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
# Liveness: the database answers at the expected schema (the uptime monitor uses /api/health?full=1).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
