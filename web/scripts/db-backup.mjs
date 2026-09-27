// SQLite backup & restore for Quest Board.
//
//   npm run db:backup                     consistent copy while the app runs (VACUUM INTO),
//                                         checked, into QUESTBOARD_BACKUP_DIR (default data/backups);
//                                         keeps the newest QUESTBOARD_BACKUP_KEEP (default 14)
//   npm run db:restore -- <file> --yes    STOP THE APP FIRST. Checks the backup, saves the current
//                                         database next to it as *.before-restore-<time>.db, then
//                                         puts the backup in place.
//
// Schedule backups nightly on the server (cron / systemd timer) and copy the folder off-site.
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SCHEMA_VERSION } from "../src/lib/schema.ts";

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15); // 20260926-153012

/** Integrity + schema version of a database file (throws if it isn't a Quest Board DB). */
export function inspect(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const ok = db.prepare("PRAGMA integrity_check").get();
    if (Object.values(ok)[0] !== "ok") throw new Error(`${file} failed the integrity check: ${JSON.stringify(ok)}`);
    const { user_version } = db.prepare("PRAGMA user_version").get();
    const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (!hasUsers) throw new Error(`${file} is not a Quest Board database.`);
    const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const games = db.prepare("SELECT COUNT(*) AS n FROM games").get().n;
    return { version: user_version, users, games };
  } finally {
    db.close();
  }
}

export function backup(dbFile, dir, keep = 14, now = new Date()) {
  if (!existsSync(dbFile)) throw new Error(`No database at ${dbFile}.`);
  mkdirSync(dir, { recursive: true });
  let out = join(dir, `questboard-${stamp(now)}.db`);
  for (let i = 2; existsSync(out); i++) out = join(dir, `questboard-${stamp(now)}-${i}.db`);
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA busy_timeout = 5000");
  try {
    db.exec(`VACUUM INTO '${resolve(out).replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  const info = inspect(out);
  // Rotation: newest `keep` backups stay (names sort by time).
  const all = readdirSync(dir).filter((f) => /^questboard-\d{8}-\d{6}(-\d+)?\.db$/.test(f)).sort();
  const removed = all.slice(0, Math.max(0, all.length - keep));
  for (const f of removed) rmSync(join(dir, f));
  return { file: out, bytes: statSync(out).size, removed: removed.length, ...info };
}

export function restore(backupFile, dbFile, now = new Date()) {
  if (!existsSync(backupFile)) throw new Error(`No backup at ${backupFile}.`);
  const info = inspect(backupFile);
  if (info.version > SCHEMA_VERSION) throw new Error(`Backup is schema v${info.version}; this app only knows up to v${SCHEMA_VERSION}.`);
  let saved = null;
  if (existsSync(dbFile)) {
    saved = join(dirname(dbFile), `${basename(dbFile, ".db")}.before-restore-${stamp(now)}.db`);
    const cur = new DatabaseSync(dbFile);
    cur.exec("PRAGMA busy_timeout = 5000");
    try { cur.exec(`VACUUM INTO '${resolve(saved).replace(/'/g, "''")}'`); } finally { cur.close(); }
  }
  for (const suffix of ["-wal", "-shm"]) rmSync(dbFile + suffix, { force: true });
  copyFileSync(backupFile, dbFile);
  return { saved, ...info };
}

function main([cmd, arg, ...rest]) {
  const dbFile = process.env.QUESTBOARD_DB ?? "data/questboard.db";
  try {
    if (cmd === "backup") {
      const dir = arg ?? process.env.QUESTBOARD_BACKUP_DIR ?? "data/backups";
      const keep = Number(process.env.QUESTBOARD_BACKUP_KEEP ?? 14) || 14;
      const r = backup(dbFile, dir, keep);
      console.log(`Backed up ${dbFile} → ${r.file} (${(r.bytes / 1024).toFixed(0)} KB, schema v${r.version}, ${r.users} users, ${r.games} games).${r.removed ? ` Removed ${r.removed} old backup(s).` : ""}`);
      return 0;
    }
    if (cmd === "restore") {
      if (!arg || !rest.includes("--yes")) {
        console.error("Usage: npm run db:restore -- <backup-file> --yes   (stop the app first)");
        return 1;
      }
      const r = restore(arg, dbFile);
      console.log(`Restored ${arg} → ${dbFile} (schema v${r.version}, ${r.users} users, ${r.games} games).${r.saved ? ` The previous database was saved as ${r.saved}.` : ""} Start the app again.`);
      return 0;
    }
    console.log("Usage: node scripts/db-backup.mjs backup [dir] | restore <file> --yes");
    return 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
