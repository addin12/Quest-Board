// The deployment's clock (deploy/docker-compose.yml runs it next to the app):
//   • every QUESTBOARD_CRON_MINUTES (default 5): POST the app's /api/cron/reminders with QUESTBOARD_CRON_SECRET
//     (reminders, notification emails, retries, waitlists, digest, clean-up);
//   • once a day at QUESTBOARD_BACKUP_HOUR_UTC (default 20, i.e. 03:00 WIB): npm run db:backup into
//     QUESTBOARD_BACKUP_DIR on the shared data volume (the database and uploaded pictures), then a copy
//     to off-site storage when QUESTBOARD_OFFSITE_* is set (scripts/offsite.mjs);
//   • every minute: the app's /api/health — after QUESTBOARD_DOWN_ALERT_MINUTES (default 10) without an
//     answer the admins are emailed, and again when it's back (scripts/health-watch.mjs).
// Logs one line per run; a failure is logged and retried next time, never fatal.
import { spawn } from "node:child_process";
import { alertAdmins, watchStep } from "./health-watch.mjs";

const APP = process.env.QUESTBOARD_APP_URL ?? "http://app:3000";
const SECRET = process.env.QUESTBOARD_CRON_SECRET ?? "";
const EVERY_MS = Math.max(1, Number(process.env.QUESTBOARD_CRON_MINUTES ?? 5)) * 60_000;
const BACKUP_HOUR = Number(process.env.QUESTBOARD_BACKUP_HOUR_UTC ?? 20);

const log = (msg) => console.log(`[scheduler ${new Date().toISOString()}] ${msg}`);

async function cron() {
  if (!SECRET) return log("QUESTBOARD_CRON_SECRET is not set: skipping the cron call");
  try {
    const res = await fetch(`${APP}/api/cron/reminders`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(120_000) });
    const body = await res.text();
    log(`cron ${res.status}${res.ok ? "" : ` ${body.slice(0, 200)}`}`);
  } catch (err) {
    log(`cron failed: ${err instanceof Error ? err.message : err}`);
  }
}

let lastBackupDay = "";
function maybeBackup() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== BACKUP_HOUR || lastBackupDay === day) return;
  lastBackupDay = day;
  log("backup starting");
  const child = spawn(process.execPath, ["scripts/db-backup.mjs", "backup"], { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    log(`backup ${code === 0 ? "done" : `failed (exit ${code})`}`);
    // Then a copy off the server (scripts/offsite.mjs; does nothing unless QUESTBOARD_OFFSITE_* is set).
    if (code === 0) spawn(process.execPath, ["scripts/offsite.mjs"], { stdio: "inherit", env: process.env }).on("exit", (c) => log(`off-site ${c === 0 ? "done" : `failed (exit ${c})`}`));
  });
}

const DOWN_AFTER_MS = Math.max(1, Number(process.env.QUESTBOARD_DOWN_ALERT_MINUTES ?? 10)) * 60_000;
let watch = { downSince: null, alerted: false, detail: "" };
async function checkHealth() {
  let healthy = false;
  let detail = "";
  try {
    const res = await fetch(`${APP}/api/health`, { signal: AbortSignal.timeout(15_000) });
    healthy = res.ok;
    if (!healthy) detail = `HTTP ${res.status}`;
  } catch (err) {
    detail = err instanceof Error ? (err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message) : String(err);
  }
  const step = watchStep(watch, healthy, Date.now(), DOWN_AFTER_MS, detail);
  if (step.send) {
    const minutes = Math.max(1, Math.round(step.downMs / 60_000));
    const since = step.state.downSince ?? watch.downSince ?? Date.now();
    const sent = await alertAdmins(step.send, { since, minutes, detail: step.state.detail || watch.detail });
    log(`app ${step.send === "down" ? `down for ${minutes} min (${detail})` : `back after ${minutes} min`}: emailed ${sent} admin(s)`);
  }
  watch = step.state;
}

// Let the app start first; then run on the clock.
setTimeout(() => {
  void cron();
  setInterval(() => void cron(), EVERY_MS);
}, 30_000);
setInterval(maybeBackup, 60_000);
setTimeout(() => setInterval(() => void checkHealth().catch((err) => log(`health check failed: ${err}`)), 60_000), 60_000);
log(`started: cron every ${EVERY_MS / 60_000} min against ${APP}; backups daily at ${String(BACKUP_HOUR).padStart(2, "0")}:00 UTC; admins emailed after ${DOWN_AFTER_MS / 60_000} min down`);
