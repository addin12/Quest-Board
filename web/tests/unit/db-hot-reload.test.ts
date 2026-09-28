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

test("an open connection prepared for an older schema is migrated on the next db() call", () => {
  const conn = db();
  // Roll the open database back two versions (undo migrations 22 and 23), as if it were opened by older code.
  conn.exec(`DROP TABLE admin_log; ALTER TABLE reviews DROP COLUMN gm_reply; ALTER TABLE reviews DROP COLUMN gm_replied_at;
    PRAGMA user_version = ${SCHEMA_VERSION - 2};`);
  (globalThis as { __questboardDbSchema?: number }).__questboardDbSchema = SCHEMA_VERSION - 2;

  const again = db();
  assert.equal(again, conn, "same connection, not a new one");
  assert.equal((again.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SCHEMA_VERSION);
  assert.ok(again.prepare("SELECT 1 FROM sqlite_master WHERE name = 'admin_log'").get());
  again.prepare("SELECT gm_reply FROM reviews LIMIT 1").all(); // the column is back
});
