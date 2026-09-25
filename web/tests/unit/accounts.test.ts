import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";
import { DICTIONARIES } from "../../src/lib/i18n/dict.ts";

test("migration 9 adds verification/deletion columns and grandfathers existing accounts as verified", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.exec(`DROP TABLE email_outbox; DROP TABLE auth_tokens;
    ALTER TABLE users DROP COLUMN email_verified_at; ALTER TABLE users DROP COLUMN deleted_at;`);
  // (v10 columns such as users.suspended_at stay — migration 9 doesn't touch them.)
  db.exec("INSERT INTO users (email, password_hash, name) VALUES ('old@x.test', 'x', 'Old Timer')");
  db.exec(MIGRATIONS[9]);
  const u = db.prepare("SELECT email_verified_at, deleted_at, created_at FROM users").get() as { email_verified_at: string; deleted_at: string | null; created_at: string };
  assert.equal(u.email_verified_at, u.created_at);
  assert.equal(u.deleted_at, null);
  // New accounts after the migration start unverified.
  db.exec("INSERT INTO users (email, password_hash, name) VALUES ('new@x.test', 'x', 'Newcomer')");
  assert.equal((db.prepare("SELECT email_verified_at FROM users WHERE email = 'new@x.test'").get() as { email_verified_at: null }).email_verified_at, null);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
  assert.ok(tables.includes("auth_tokens") && tables.includes("email_outbox"));
});

test("auth_tokens only stores hashes and rejects duplicate hashes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.exec("INSERT INTO users (id, email, password_hash, name) VALUES (1, 'a@x.test', 'x', 'A')");
  const ins = db.prepare("INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (1, ?, 'h1', '2099-01-01')");
  ins.run("reset");
  assert.throws(() => ins.run("verify"), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (1, 'magic', 'h2', '2099-01-01')").run(), /CHECK/);
});

test("emails and legal pages exist in both languages with the same placeholders", () => {
  for (const k of ["mail.verifyBody", "mail.resetBody"] as const) {
    for (const lang of ["en", "id"] as const) {
      assert.match(DICTIONARIES[lang][k], /\{link\}/, `${lang}:${k} must contain the link`);
      assert.match(DICTIONARIES[lang][k], /\{name\}/);
    }
  }
  for (let n = 1; n <= 10; n++) assert.ok(DICTIONARIES.id[`legal.terms.${n}.body` as keyof typeof DICTIONARIES.id]);
  for (let n = 1; n <= 11; n++) assert.ok(DICTIONARIES.id[`legal.privacy.${n}.body` as keyof typeof DICTIONARIES.id]);
  assert.match(DICTIONARIES.en["legal.privacy.intro"], /UU No\. 27 Tahun 2022/);
});
