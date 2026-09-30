import "server-only";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";
import { LEGAL_VERSION } from "./legal";
import { setupChecks, type SetupCheck } from "./setup-check";

/** The newest backup file's time (db-backup.mjs writes questboard-<stamp>.db into QUESTBOARD_BACKUP_DIR). */
function lastBackupAt(): string | null {
  const dir = process.env.QUESTBOARD_BACKUP_DIR ?? "data/backups";
  try {
    const times = readdirSync(dir).filter((f) => f.endsWith(".db")).map((f) => statSync(join(dir, f)).mtimeMs);
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  } catch {
    return null; // no backup folder yet
  }
}

/** This server's setup checks (admin Setup tab, startup log). */
export function currentSetupChecks(): SetupCheck[] {
  const cronLastRun = (db().prepare("SELECT value FROM app_state WHERE key = 'cron_last_run'").get() as { value: string } | undefined)?.value ?? null;
  return setupChecks({ env: process.env, cronLastRun, lastBackupAt: lastBackupAt(), legalVersion: LEGAL_VERSION, now: Date.now() });
}
