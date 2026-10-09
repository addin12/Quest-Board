import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";
import { verifyPassword } from "../../src/lib/password.ts";
import { createAdmin, demote, endAllSessions, listAdmins, promote } from "../../scripts/admin.mjs";

const fresh = () => { const db = new DatabaseSync(":memory:"); db.exec(SCHEMA_SQL); return db; };

test("admin CLI: create gives a verified admin with a working one-time password; no duplicates", () => {
  const db = fresh();
  const { password } = createAdmin(db, " Owner@Example.com ", "Owner");
  const u = db.prepare("SELECT email, role, email_verified_at, password_hash FROM users").get() as { email: string; role: string; email_verified_at: string | null; password_hash: string };
  assert.equal(u.email, "owner@example.com");
  assert.equal(u.role, "admin");
  assert.ok(u.email_verified_at);
  assert.ok(verifyPassword(password, u.password_hash));
  assert.throws(() => createAdmin(db, "owner@example.com", "Again"), /already has an account/);
  assert.throws(() => createAdmin(db, "not-an-email", "X Y"), /valid email/);
});

test("admin CLI: promote and demote, never removing the last admin", () => {
  const db = fresh();
  createAdmin(db, "a@x.test", "Admin A");
  db.exec("INSERT INTO users (email, password_hash, name, role) VALUES ('gm@x.test', 'x', 'Game Master', 'gm')");
  db.exec("INSERT INTO gm_profiles (user_id, headline) SELECT id, 'Horror GM' FROM users WHERE email = 'gm@x.test'");
  db.exec("INSERT INTO users (email, password_hash, name, suspended_at) VALUES ('bad@x.test', 'x', 'Suspended', '2026-01-01')");
  assert.throws(() => demote(db, "a@x.test"), /last admin/);
  assert.equal(promote(db, "gm@x.test"), true);
  assert.equal(promote(db, "gm@x.test"), false);
  assert.throws(() => promote(db, "bad@x.test"), /suspended/);
  assert.throws(() => promote(db, "nobody@x.test"), /No account/);
  assert.equal(listAdmins(db).length, 2);
  assert.equal(demote(db, "gm@x.test"), true);
  assert.equal((db.prepare("SELECT role FROM users WHERE email = 'gm@x.test'").get() as { role: string }).role, "gm"); // keeps their GM role
});

test("admin CLI: end-sessions logs everyone out", () => {
  const db = fresh();
  createAdmin(db, "end@x.test", "End");
  const uid = (db.prepare("SELECT id FROM users WHERE email = 'end@x.test'").get() as { id: number }).id;
  db.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ('a', ?, '2099'), ('b', ?, '2099')").run(uid, uid);
  assert.equal(endAllSessions(db), 2);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get() as { n: number }).n, 0);
});
