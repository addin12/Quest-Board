#!/bin/sh
# Quest Board: update to the newest version — and go back by itself if it doesn't come up healthy.
#
#   cd Quest-Board/deploy && sh update.sh
#
# 1. Remembers the version that's running now, and makes a fresh backup.
# 2. Gets the new version: git pull, then the ready-made image (QUESTBOARD_IMAGE in .env) or a build.
# 3. Starts it and waits until Docker's health check says it's healthy (QUESTBOARD_UPDATE_WAIT seconds,
#    default 180).
# 4. If it isn't: keeps the new version's logs in update-failed-<time>.log, puts the previous version back
#    and, when the new one had already upgraded the database, the copy made just before that upgrade.
#    (Anything people did in the few minutes in between is lost; the backup from step 1 is kept.)
#
# Exit code: 0 updated, 1 rolled back (the site runs the previous version), 2 something else went wrong.
# For the production rehearsal only: QUESTBOARD_COMPOSE (how to call docker compose) and
# QUESTBOARD_UPDATE_SKIP_FETCH=1 (use whatever image QUESTBOARD_IMAGE names, without git pull or download).
set -eu
cd "$(dirname "$0")"

COMPOSE=${QUESTBOARD_COMPOSE:-docker compose}
WAIT=${QUESTBOARD_UPDATE_WAIT:-180}
STARTED=$(date -u +%Y%m%d-%H%M%S)
say() { printf '[update] %s\n' "$*"; }
dc() { $COMPOSE "$@"; }

# QUESTBOARD_IMAGE: from the environment, else deploy/.env (as docker compose itself reads it).
if [ -z "${QUESTBOARD_IMAGE:-}" ] && [ -f .env ]; then
  QUESTBOARD_IMAGE=$(sed -n 's/^QUESTBOARD_IMAGE=//p' .env | tail -n 1)
fi

health() {
  id=$(dc ps -q app 2>/dev/null || true)
  [ -n "$id" ] || { echo none; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo none
}
wait_healthy() {
  waited=0
  while [ "$waited" -lt "$WAIT" ]; do
    [ "$(health)" = healthy ] && return 0
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

# ── 1. What runs now, and a fresh backup ──
current=$(dc ps -q app 2>/dev/null || true)
[ -n "$current" ] || { say "Quest Board isn't running here: start it first (README, First start)."; exit 2; }
docker tag "$(docker inspect -f '{{.Image}}' "$current")" questboard-app:previous
say "The running version is saved as questboard-app:previous."
dc exec -T scheduler npm run --silent db:backup || dc run --rm --no-deps scheduler npm run --silent db:backup || {
  say "The backup failed, so nothing was changed. See: $COMPOSE logs scheduler"; exit 2; }

# ── 2. The new version ──
if [ "${QUESTBOARD_UPDATE_SKIP_FETCH:-}" != 1 ]; then
  git pull --ff-only
  if [ -n "${QUESTBOARD_IMAGE:-}" ]; then dc pull app scheduler; else dc build app scheduler; fi
fi

# ── 3. Start it ──
export QUESTBOARD_IMAGE
dc up -d --no-build app scheduler
say "Waiting up to ${WAIT}s for the new version to be healthy…"
if wait_healthy; then
  say "Updated. Check Admin → Setup once."
  exit 0
fi

# ── 4. Not healthy: back to the previous version ──
log="update-failed-$STARTED.log"
dc logs --no-color --tail 300 app scheduler > "$log" 2>&1 || true
say "The new version didn't become healthy (its logs: deploy/$log). Going back to the previous version."
dc stop app scheduler
QUESTBOARD_IMAGE=questboard-app:previous
export QUESTBOARD_IMAGE
# The copy the new version made just before upgrading the database (lib/db.ts), if it made one now.
copy=$(dc run --rm --no-deps -T app sh -c 'ls -1 /data/backups 2>/dev/null | grep "^questboard-before-v" | sed "s/.*-\([0-9]\{8\}-[0-9]\{6\}\)\.db$/\1 &/" | sort | tail -n 1' | tr -d '\r' || true)
stamp=${copy%% *}
file=${copy#* }
# Made during this update? (Stamps sort by time: the copy's must not sort before the start's.)
if [ -n "$copy" ] && [ "$(printf '%s\n%s\n' "$STARTED" "$stamp" | sort | tail -n 1)" = "$stamp" ]; then
  say "Restoring the database as it was before the upgrade ($file)."
  dc run --rm --no-deps -T app node scripts/db-backup.mjs restore "/data/backups/$file" --yes
fi
dc up -d --no-build app scheduler
if wait_healthy; then
  say "Rolled back: the site runs the previous version again. Nothing else to do now; send deploy/$log along when asking for help."
  exit 1
fi
say "The previous version isn't healthy either. See: $COMPOSE logs app — and README, Restoring a backup."
exit 2
