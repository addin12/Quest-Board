// Before the database is upgraded to a new schema, a copy of it is kept (lib/db.ts copyBeforeUpgrade):
// an upgrade that goes wrong can then be undone exactly, which last night's backup can't promise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL, SCHEMA_VERSION } from "../../src/lib/schema.ts";

const dir = mkdtempSync(join(tmpdir(), "qb-upgrade-"));
const file = join(dir, "questboard.db");
process.env.QUESTBOARD_DB = file;
process.env.QUESTBOARD_SEED = "false";
delete process.env.QUESTBOARD_BACKUP_DIR; // next to the database: <dir>/backups

// A database from the previous version, with something in it. (Undoes the NEWEST migration: when adding
// migration N, replace this with its inverse, as in db-hot-reload.test.ts.)
{
  const old = new DatabaseSync(file);
  old.exec(SCHEMA_SQL);
  old.exec(`ALTER TABLE gm_profiles DROP COLUMN refund_terms; ALTER TABLE gm_profiles DROP COLUMN payment_qr; ALTER TABLE games DROP COLUMN table_link; PRAGMA user_version = ${SCHEMA_VERSION - 1};`);
  old.prepare("INSERT INTO app_state (key, value) VALUES ('marker', 'from before the upgrade')").run();
  old.close();
}
// Older copies from earlier upgrades: only the newest few are kept.
mkdirSync(join(dir, "backups"));
for (let i = 1; i <= 6; i++) writeFileSync(join(dir, "backups", `questboard-before-v${20 + i}-from-v${19 + i}-2026010${i}-120000.db`), "old");
writeFileSync(join(dir, "backups", "questboard-20260101-200000.db"), "a nightly backup: not touched");

test("upgrading keeps an exact copy of the old database, and the newest 5 copies", async () => {
  const { db, KEEP_BEFORE_UPGRADE } = await import("../../src/lib/db.ts");
  assert.equal((db().prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SCHEMA_VERSION);

  const files = readdirSync(join(dir, "backups"));
  const copy = files.find((f) => f.startsWith(`questboard-before-v${SCHEMA_VERSION}-from-v${SCHEMA_VERSION - 1}-`));
  assert.ok(copy, files.join(", "));
  const saved = new DatabaseSync(join(dir, "backups", copy!), { readOnly: true });
  assert.equal((saved.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SCHEMA_VERSION - 1);
  assert.equal((saved.prepare("SELECT value FROM app_state WHERE key = 'marker'").get() as { value: string }).value, "from before the upgrade");
  saved.close();

  const copies = files.filter((f) => f.startsWith("questboard-before-")).sort();
  assert.equal(copies.length, KEEP_BEFORE_UPGRADE);
  assert.ok(!copies.includes("questboard-before-v21-from-v20-20260101-120000.db")); // the oldest went
  assert.ok(!copies.includes("questboard-before-v22-from-v21-20260102-120000.db"));
  assert.ok(files.includes("questboard-20260101-200000.db")); // the nightly rotation is separate
});
