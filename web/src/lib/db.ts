import "server-only";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";
import { MIGRATIONS, planSchemaUpgrade } from "./migrations";
import { seedDatabase } from "./seed";

// One connection per server process. Cached on globalThis so dev hot-reloads
// don't open a new handle on every edit.
const globalForDb = globalThis as unknown as { __questboardDb?: DatabaseSync };

/**
 * Dev-only escape hatch when no migration path exists (e.g. pre-v4 demo DBs):
 * copy the DB to `<file>.v<N>.bak` (never deleted) and empty it so the current
 * schema + seed can be applied. `VACUUM INTO` + DROP avoids renaming files,
 * which fails on Windows while another handle holds the WAL.
 */
function backupAndEmpty(conn: DatabaseSync, file: string, version: number) {
  const oldVersion = version || 1; // v1 predates user_version tracking
  let backup = `${file}.v${oldVersion}.bak`;
  for (let i = 2; existsSync(backup); i++) backup = `${file}.v${oldVersion}.${i}.bak`;
  conn.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  const tables = conn
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  conn.exec("PRAGMA foreign_keys = OFF; BEGIN");
  for (const { name } of tables) conn.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`);
  conn.exec("COMMIT; PRAGMA foreign_keys = ON;");
  console.warn(`[quest-board] No migration path from schema v${oldVersion}; backed up to ${backup} and recreating v${SCHEMA_VERSION}.`);
}

/** Bring the database to SCHEMA_VERSION: create, migrate (keeping data), or — dev only — reset. */
function prepareSchema(conn: DatabaseSync, file: string) {
  const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  const { n: tableCount } = conn
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .get() as { n: number };
  const plan = planSchemaUpgrade({
    current: user_version,
    target: SCHEMA_VERSION,
    hasTables: tableCount > 0,
    isProduction: process.env.NODE_ENV === "production" && process.env.QUESTBOARD_ALLOW_RESET !== "true",
  });

  switch (plan.kind) {
    case "none":
      return;
    case "error":
      throw new Error(`[quest-board] ${plan.reason}`);
    case "reset":
      backupAndEmpty(conn, file, user_version);
    // falls through: create the current schema on the now-empty database
    case "fresh":
      conn.exec(SCHEMA_SQL);
      conn.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
      return;
    case "migrate":
      for (const v of plan.steps) {
        conn.exec("BEGIN IMMEDIATE");
        try {
          conn.exec(MIGRATIONS[v]);
          conn.exec(`PRAGMA user_version = ${v};`);
          conn.exec("COMMIT");
        } catch (err) {
          conn.exec("ROLLBACK");
          throw err;
        }
        console.info(`[quest-board] Migrated database to schema v${v}.`);
      }
  }
}

function open(): DatabaseSync {
  const file = process.env.QUESTBOARD_DB ?? path.join(process.cwd(), "data", "questboard.db");
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // busy_timeout: wait (up to 5 s) for another writer — a backup, the admin CLI — instead of failing.
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  prepareSchema(db, file);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n === 0 && process.env.QUESTBOARD_SEED !== "false") seedDatabase(db);
  return db;
}

export function db(): DatabaseSync {
  if (!globalForDb.__questboardDb) globalForDb.__questboardDb = open();
  return globalForDb.__questboardDb;
}

/** Run `fn` inside a transaction; rolls back on throw. */
export function tx<T>(fn: (conn: DatabaseSync) => T): T {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(conn);
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
