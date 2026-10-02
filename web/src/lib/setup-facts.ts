import "server-only";
import { readdirSync, statSync, statfsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { db } from "./db";
import { LEGAL_VERSION } from "./legal";
import { sentLast24h } from "./mailer";
import { isPrelaunch, launchNotifyCount } from "./prelaunch";
import { setupChecks, type SetupCheck } from "./setup-check";

/** The newest backup file's time (db-backup.mjs writes questboard-<stamp>.db into QUESTBOARD_BACKUP_DIR). */
function lastBackupAt(): string | null {
  const dir = process.env.QUESTBOARD_BACKUP_DIR ?? "data/backups";
  try {
    // Nightly ones only: a copy made before an upgrade (questboard-before-v…) says nothing about the nightly job.
    const times = readdirSync(/* turbopackIgnore: true */ dir).filter((f) => /^questboard-\d{8}-\d{6}(-\d+)?\.db$/.test(f)).map((f) => statSync(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, f)).mtimeMs);
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  } catch {
    return null; // no backup folder yet
  }
}

/** Free bytes on the disk that holds the database (data volume), or null. */
function diskFreeBytes(): number | null {
  try {
    const s = statfsSync(/* turbopackIgnore: true */ dirname(resolve(/* turbopackIgnore: true */ process.env.QUESTBOARD_DB ?? "data/questboard.db")));
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** This server's setup checks (admin Setup tab, startup log). */
export function currentSetupChecks(): SetupCheck[] {
  const state = (key: string) => (db().prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
  let offsiteLast = null;
  try { offsiteLast = JSON.parse(state("offsite_last") ?? "null"); } catch { /* unreadable: treat as none */ }
  return setupChecks({ env: process.env, cronLastRun: state("cron_last_run"), lastBackupAt: lastBackupAt(), emailSent24h: sentLast24h(), prelaunch: { on: isPrelaunch(), waiting: launchNotifyCount() }, diskFreeBytes: diskFreeBytes(), offsiteLast, legalVersion: LEGAL_VERSION, now: Date.now() });
}
