import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { REPORT_REASONS, REPORT_TARGETS, canRemove, parseReport, reasonKey, targetKey } from "../../src/lib/reports.ts";
import { DICTIONARIES } from "../../src/lib/i18n/dict.ts";
import { MIGRATIONS } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";

test("parseReport validates target, reason and details", () => {
  assert.deepEqual(parseReport({ targetType: "review", targetId: "7", reason: "spam", details: "" }), {
    ok: true, value: { targetType: "review", targetId: 7, reason: "spam", details: "" },
  });
  const bad = parseReport({ targetType: "planet", targetId: "x", reason: "boredom", details: "" });
  assert.ok(!bad.ok && bad.errors.target === "err.notFound" && bad.errors.reason === "v.reportReason");
  const other = parseReport({ targetType: "game", targetId: 1, reason: "other", details: "short" });
  assert.ok(!other.ok && other.errors.details === "v.reportDetails"); // "other" needs a description
  const long = parseReport({ targetType: "game", targetId: 1, reason: "spam", details: "x".repeat(1001) });
  assert.ok(!long.ok && long.errors.details === "v.reportDetails");
});

test("every reason and target has a label in both languages; people are suspended, not removed", () => {
  for (const lang of ["en", "id"] as const) {
    for (const r of REPORT_REASONS) assert.ok(DICTIONARIES[lang][reasonKey(r)], `${lang} ${r}`);
    for (const t of REPORT_TARGETS) assert.ok(DICTIONARIES[lang][targetKey(t)], `${lang} ${t}`);
  }
  assert.equal(canRemove("user"), false);
  assert.equal(canRemove("review"), true);
});

test("migration 10 adds reports, suspension and notification report ids; the DB enforces valid values", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.exec("DROP TABLE reports; ALTER TABLE users DROP COLUMN suspended_at; ALTER TABLE notifications DROP COLUMN report_id;");
  db.exec(MIGRATIONS[10]);
  db.exec("INSERT INTO users (id, email, password_hash, name) VALUES (1, 'a@x.test', 'x', 'A'), (2, 'b@x.test', 'x', 'B')");
  const ins = db.prepare("INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, snapshot, href) VALUES (1, ?, 5, 2, ?, 's', '/x')");
  ins.run("review", "spam");
  assert.throws(() => ins.run("planet", "spam"), /CHECK/);
  assert.throws(() => ins.run("review", "boredom"), /CHECK/);
  assert.equal((db.prepare("SELECT status FROM reports").get() as { status: string }).status, "open");
  db.exec("UPDATE users SET suspended_at = 'now' WHERE id = 2");
  db.exec("INSERT INTO notifications (user_id, kind, report_id) VALUES (1, 'report_resolved', 1)");
});
