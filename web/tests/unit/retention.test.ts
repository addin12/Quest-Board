// Security records are deleted once they've done their job (Privacy Policy, "How long we keep data").
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-retention-")), "test.db");
process.env.QUESTBOARD_SEED = "false";

const { db } = await import("../../src/lib/db.ts");
const { pruneSecurityRecords } = await import("../../src/lib/retention.ts");

test("devices unused for a year, year-old payment changes and unfinished login steps are deleted; recent ones stay", () => {
  const now = Date.parse("2026-10-10T00:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const uid = Number(db().prepare("INSERT INTO users (email, password_hash, name) VALUES ('r@x.test', 'x', 'R')").run().lastInsertRowid);
  const device = db().prepare("INSERT INTO login_devices (user_id, device_hash, device, first_seen_at, last_seen_at) VALUES (?, ?, '', ?, ?)");
  device.run(uid, "old", ago(900), ago(400));
  device.run(uid, "used", ago(900), ago(10)); // first seen long ago, but still in use
  db().prepare("INSERT INTO payment_changes (user_id, changed_at) VALUES (?, ?), (?, ?)").run(uid, ago(400), uid, ago(20));
  db().prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES ('a', ?, ?), ('b', ?, ?)").run(uid, ago(1), uid, new Date(now + 300_000).toISOString());

  assert.deepEqual(pruneSecurityRecords(now), { devices: 1, paymentChanges: 1, loginSteps: 1 });
  assert.deepEqual(db().prepare("SELECT device_hash FROM login_devices").all().map((r) => (r as { device_hash: string }).device_hash), ["used"]);
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM payment_changes").get() as { n: number }).n, 1);
  assert.equal((db().prepare("SELECT token_hash FROM login_challenges").get() as { token_hash: string }).token_hash, "b");
  assert.deepEqual(pruneSecurityRecords(now), { devices: 0, paymentChanges: 0, loginSteps: 0 });
});
