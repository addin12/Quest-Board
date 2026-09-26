import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";
import { formatWib, planReminders, type ReminderCandidate } from "../../src/lib/reminder-plan.ts";

const H = 3_600_000;
const now = new Date("2026-10-01T00:00:00.000Z");
const at = (hours: number) => new Date(now.getTime() + hours * H).toISOString();
const row = (over: Partial<ReminderCandidate>): ReminderCandidate => ({
  session_id: 1, user_id: 2, role: "player", starts_at: at(20), booked_at: at(-72), sent: [], ...over,
});
const kinds = (rows: ReminderCandidate[]) => planReminders(rows, now).map((r) => r.kind);

test("24h reminder inside the day, 1h reminder inside the hour, nothing outside the windows", () => {
  assert.deepEqual(kinds([row({ starts_at: at(20) })]), ["24h"]);
  assert.deepEqual(kinds([row({ starts_at: at(0.5) })]), ["1h"]);
  assert.deepEqual(kinds([row({ starts_at: at(25) })]), []);
  assert.deepEqual(kinds([row({ starts_at: at(-0.1) })]), []); // already started
});

test("each reminder goes out once, and the 24h one is skipped when under 2 hours remain", () => {
  assert.deepEqual(kinds([row({ starts_at: at(20), sent: ["24h"] })]), []);
  assert.deepEqual(kinds([row({ starts_at: at(0.5), sent: ["24h", "1h"] })]), []);
  assert.deepEqual(kinds([row({ starts_at: at(1.5) })]), []); // between windows: wait for the 1h one
});

test("players who booked after a window opened don't get that reminder; the GM always does", () => {
  assert.deepEqual(kinds([row({ starts_at: at(20), booked_at: at(-1) })]), []); // booked 21 h before the start
  assert.deepEqual(kinds([row({ starts_at: at(0.5), booked_at: at(-0.2) })]), []); // booked 42 min before
  assert.deepEqual(kinds([row({ starts_at: at(0.5), booked_at: at(-3) })]), ["1h"]);
  assert.deepEqual(kinds([row({ role: "gm", booked_at: null, starts_at: at(20) })]), ["24h"]);
});

test("email times are shown in WIB in the reader's language", () => {
  assert.equal(formatWib("2026-10-03T12:00:00.000Z", "en"), "Sat 3 Oct, 19.00 WIB");
  assert.equal(formatWib("2026-10-03T12:00:00.000Z", "id"), "Sab, 3 Okt, 19.00 WIB");
});

test("migration 13 adds locale and reminder settings (existing people: English, reminders on) and the reminders table", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.exec("DROP TABLE session_reminders; ALTER TABLE users DROP COLUMN locale; ALTER TABLE users DROP COLUMN email_reminders;");
  db.exec("INSERT INTO users (email, password_hash, name) VALUES ('old@x.test', 'x', 'Old Timer')");
  db.exec(MIGRATIONS[13]);
  assert.deepEqual({ ...(db.prepare("SELECT locale, email_reminders FROM users").get() as object) }, { locale: "en", email_reminders: 1 });
  assert.throws(() => db.exec("UPDATE users SET locale = 'fr'"));
  const cols = (db.prepare("PRAGMA table_info(session_reminders)").all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(cols, ["session_id", "user_id", "kind", "sent_at"]);
});
