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
const UNDO_LATEST = "DROP TABLE security_counters;";
const latestIsBack = (conn: ReturnType<typeof db>) => conn.prepare("SELECT n FROM security_counters LIMIT 1").all();

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
