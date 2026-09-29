// Dev hot reload: new code (a newer SCHEMA_VERSION) over an already-open connection must migrate it,
// not query tables that don't exist yet ("no such table: …" until the server restarts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-reload-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");
const { SCHEMA_VERSION } = await import("../../src/lib/schema.ts");

// Undo of the NEWEST migration only. When adding migration N, replace this with N's inverse
// (as in hardening.test.ts) and update the check below.
const UNDO_LATEST = "CREATE TABLE reports_v31 (   id              INTEGER PRIMARY KEY AUTOINCREMENT,   reporter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   target_type     TEXT NOT NULL CHECK (target_type IN ('game','review','review_reply','message','request_message','user','lfg_post','lfg_reply')),   target_id       INTEGER NOT NULL,   target_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   reason          TEXT NOT NULL CHECK (reason IN ('scam','harassment','inappropriate','spam','misleading','other')),   details         TEXT NOT NULL DEFAULT '',   snapshot        TEXT NOT NULL,   href            TEXT NOT NULL,   status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),   decision        TEXT CHECK (decision IN ('remove','suspend','dismiss')),   note            TEXT NOT NULL DEFAULT '',   resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,   created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),   resolved_at     TEXT ); INSERT INTO reports_v31 (id, reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href, status, decision, note, resolved_by, created_at, resolved_at) SELECT id, reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href, status, decision, note, resolved_by, created_at, resolved_at FROM reports; DROP TABLE reports; ALTER TABLE reports_v31 RENAME TO reports; CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at); CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);";
const latestIsBack = (conn: ReturnType<typeof db>) => {
  const col = conn.prepare("SELECT \"notnull\" AS nn FROM pragma_table_info('reports') WHERE name = 'reporter_id'").get() as { nn: number };
  if (col.nn) throw new Error("reports.reporter_id is still NOT NULL");
};

test("an open connection prepared for an older schema is migrated on the next db() call", () => {
  const conn = db();
  // As if this connection had been opened by the previous version of the code.
  conn.exec(`${UNDO_LATEST} PRAGMA user_version = ${SCHEMA_VERSION - 1};`);
  (globalThis as { __questboardDbSchema?: number }).__questboardDbSchema = SCHEMA_VERSION - 1;

  const again = db();
  assert.equal(again, conn, "same connection, not a new one");
  assert.equal((again.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SCHEMA_VERSION);
  latestIsBack(again); // throws "no such column" if the migration didn't run
});
