import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { escapeLike, fixedWindow } from "../../src/lib/policy.ts";
import { BASELINE_VERSION, MIGRATIONS, planSchemaUpgrade } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL, SCHEMA_VERSION } from "../../src/lib/schema.ts";

test("escapeLike makes % _ and \\ literal", () => {
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("c:\\x"), "c:\\\\x");
  assert.equal(escapeLike("horor"), "horor");

  // And it actually works in SQLite with ESCAPE '\'.
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('100% fun'), ('boring')");
  const count = (q: string) =>
    (db.prepare("SELECT COUNT(*) AS n FROM t WHERE v LIKE ? ESCAPE '\\'").get(`%${escapeLike(q)}%`) as { n: number }).n;
  assert.equal(count("%"), 1); // only the row that really contains "%"
  assert.equal(count("_"), 0);
});

test("fixedWindow allows up to the limit, then blocks until the window resets", () => {
  const limit = 3, win = 60_000;
  let w: ReturnType<typeof fixedWindow>["next"] | undefined;
  for (let i = 0; i < limit; i++) {
    const r = fixedWindow(w, 1_000 + i, limit, win);
    assert.equal(r.allowed, true);
    w = r.next;
  }
  const blocked = fixedWindow(w, 2_000, limit, win);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= win);
  const fresh = fixedWindow(w, 1_000 + win, limit, win);
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.next.count, 1);
});

test("planSchemaUpgrade: fresh, none, migrate, dev reset, prod refusal", () => {
  const m = { 5: "x", 6: "y" };
  assert.deepEqual(planSchemaUpgrade({ current: 0, target: 6, hasTables: false, isProduction: true, migrations: m }), { kind: "fresh" });
  assert.deepEqual(planSchemaUpgrade({ current: 6, target: 6, hasTables: true, isProduction: true, migrations: m }), { kind: "none" });
  assert.deepEqual(planSchemaUpgrade({ current: 4, target: 6, hasTables: true, isProduction: true, migrations: m }), { kind: "migrate", steps: [5, 6] });
  assert.equal(planSchemaUpgrade({ current: 3, target: 6, hasTables: true, isProduction: false, migrations: m }).kind, "reset");
  assert.equal(planSchemaUpgrade({ current: 3, target: 6, hasTables: true, isProduction: true, migrations: m }).kind, "error");
  assert.equal(planSchemaUpgrade({ current: 7, target: 6, hasTables: true, isProduction: false, migrations: m }).kind, "error");
});

test("every version after the baseline has a migration, and SCHEMA_VERSION is the latest", () => {
  for (let v = BASELINE_VERSION + 1; v <= SCHEMA_VERSION; v++) assert.ok(v in MIGRATIONS, `missing migration to v${v}`);
  assert.equal(Math.max(BASELINE_VERSION, ...Object.keys(MIGRATIONS).map(Number)), SCHEMA_VERSION);
});

test("a v4 database migrates to the current schema without losing data", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  // Simulate a v4 database by undoing everything added since v4.
  // (When adding migration N, add its inverse here.)
  db.exec(`DROP TABLE rate_limits;
    ALTER TABLE games DROP COLUMN cover_image; ALTER TABLE users DROP COLUMN avatar_image;
    ALTER TABLE games DROP COLUMN genres; ALTER TABLE games DROP COLUMN styles;
    DROP TABLE reports; ALTER TABLE users DROP COLUMN suspended_at; ALTER TABLE notifications DROP COLUMN report_id;
    DROP TABLE email_outbox; DROP TABLE auth_tokens;
    ALTER TABLE users DROP COLUMN email_verified_at; ALTER TABLE users DROP COLUMN deleted_at;
    DROP TABLE notifications;
    DROP TABLE gm_request_messages; DROP TABLE gm_request_offers; DROP TABLE gm_requests;
    PRAGMA user_version = 4;`);
  db.exec("INSERT INTO users (email, password_hash, name) VALUES ('keep@me.test', 'x', 'Keeper')");

  const plan = planSchemaUpgrade({ current: 4, target: SCHEMA_VERSION, hasTables: true, isProduction: true });
  assert.equal(plan.kind, "migrate");
  if (plan.kind === "migrate") for (const v of plan.steps) db.exec(MIGRATIONS[v]);

  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
  assert.ok(tables.includes("rate_limits"));
  assert.ok(tables.includes("notifications"));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n, 1);
});
