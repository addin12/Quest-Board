// The "Download my data" export (UU PDP right of access) must cover every table that holds someone's data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-export-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");
const { exportAccount } = await import("../../src/lib/account.ts");

/**
 * Every table with a column pointing at users(id), and where it is in the export — or why it isn't.
 * Adding a table that references users? Export it in exportAccount() or add it here with a reason.
 */
const COVERAGE: Record<string, string> = {
  users: "account",
  login_challenges: "excluded: a 10-minute login step, deleted when used",
  gm_profiles: "gm_profile",
  games: "games_run",
  bookings: "bookings",
  reviews: "reviews",
  messages: "table_messages",
  gm_requests: "gm_requests",
  gm_request_offers: "offers_sent",
  gm_request_messages: "request_messages",
  notifications: "notifications",
  lfg_posts: "notice_board_posts",
  lfg_replies: "notice_board_replies",
  saved_games: "saved_games",
  gm_follows: "following",
  game_questions: "questions",
  game_question_messages: "questions",
  feedback: "feedback",
  waitlist: "waitlist",
  reports: "reports_filed",
  uploads: "uploads",
  auth_sessions: "excluded: sign-in session tokens (secrets, no personal content)",
  auth_tokens: "excluded: one-time link tokens (secrets)",
  session_reminders: "excluded: which reminders were sent (bookkeeping; the notifications are exported)",
  review_prompts: "excluded: when a review prompt was sent (bookkeeping; the notification is exported)",
  admin_log: "excluded: the moderators' audit trail (kept for accountability; decisions about you reach you as notifications)",
};

test("every table that references a user is in the data export or excluded on purpose", () => {
  const tables = (db().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
  const referencing = tables.filter((t) =>
    t === "users" || (db().prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string }[]).some((fk) => fk.table === "users"));
  const missing = referencing.filter((t) => !(t in COVERAGE));
  assert.deepEqual(missing, [], `add these tables to exportAccount() or to COVERAGE with a reason: ${missing.join(", ")}`);

  const id = Number(db().prepare("INSERT INTO users (email, password_hash, name) VALUES ('me@x.test', 'x', 'Me')").run().lastInsertRowid);
  const data = exportAccount(id) as Record<string, unknown>;
  for (const [table, key] of Object.entries(COVERAGE)) {
    if (!key.startsWith("excluded:")) assert.ok(key in data, `${table} → export key "${key}" is missing`);
  }
  assert.equal((data.account as { email: string }).email, "me@x.test");
  assert.ok(!JSON.stringify(data).includes("password_hash"));
});
