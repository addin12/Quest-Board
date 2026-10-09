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
  db.exec(`DROP INDEX idx_fk_auth_sessions_user_id; DROP INDEX idx_fk_login_challenges_user_id; DROP INDEX idx_fk_reviews_player_id; DROP INDEX idx_fk_messages_user_id; DROP INDEX idx_fk_gm_requests_matched_gm_id; DROP INDEX idx_fk_gm_requests_gm_id; DROP INDEX idx_fk_gm_requests_requester_id; DROP INDEX idx_fk_gm_request_offers_gm_id; DROP INDEX idx_fk_gm_request_messages_user_id; DROP INDEX idx_fk_notifications_session_id; DROP INDEX idx_fk_notifications_request_id; DROP INDEX idx_fk_notifications_actor_id; DROP INDEX idx_fk_game_questions_player_id; DROP INDEX idx_fk_game_question_messages_user_id; DROP INDEX idx_fk_feedback_user_id; DROP INDEX idx_fk_email_queue_notification_id; DROP INDEX idx_fk_review_prompts_player_id; DROP INDEX idx_fk_session_reminders_user_id; DROP INDEX idx_fk_gm_invites_used_by; DROP INDEX idx_fk_gm_invites_created_by; DROP INDEX idx_fk_reports_resolved_by; DROP INDEX idx_fk_reports_target_owner_id; DROP INDEX idx_fk_reports_reporter_id; DROP INDEX idx_fk_waitlist_player_id; DROP INDEX idx_fk_lfg_posts_author_id; DROP INDEX idx_fk_lfg_replies_author_id; DROP INDEX idx_fk_saved_games_game_id; DROP INDEX idx_fk_admin_log_target_user_id; DROP INDEX idx_fk_admin_log_admin_id; DROP TABLE security_events; DROP TABLE web_vitals;
    ALTER TABLE bookings DROP COLUMN player_paid_at;
    ALTER TABLE games DROP COLUMN venue_name; ALTER TABLE games DROP COLUMN venue_maps_url;
    ALTER TABLE gm_profiles DROP COLUMN refund_terms; ALTER TABLE gm_profiles DROP COLUMN payment_qr; ALTER TABLE games DROP COLUMN table_link;
    DROP TABLE gm_invites; DROP TABLE launch_notify;
    DROP TABLE email_suppressions; ALTER TABLE email_outbox DROP COLUMN suppressed;
    DROP TABLE email_changes;
    ALTER TABLE email_outbox DROP COLUMN provider; ALTER TABLE email_outbox DROP COLUMN optional; ALTER TABLE email_outbox DROP COLUMN expires_at; ALTER TABLE email_outbox DROP COLUMN deferred;
    ALTER TABLE email_outbox DROP COLUMN headers;
    ALTER TABLE users DROP COLUMN time_zone;
    ALTER TABLE users DROP COLUMN legal_seen_version;
    DROP TABLE login_devices;
    ALTER TABLE auth_sessions DROP COLUMN created_at; ALTER TABLE auth_sessions DROP COLUMN last_seen_at; ALTER TABLE auth_sessions DROP COLUMN device;
    DROP TABLE payment_changes;
    DROP TABLE login_challenges;
    ALTER TABLE users DROP COLUMN totp_secret; ALTER TABLE users DROP COLUMN totp_enabled_at; ALTER TABLE users DROP COLUMN totp_last_step;
    DROP TABLE app_state;
    DROP TABLE uploads;
    ALTER TABLE lfg_posts DROP COLUMN expiry_notified_at;
    ALTER TABLE reviews DROP COLUMN edited_at;
    ALTER TABLE reviews DROP COLUMN gm_reply; ALTER TABLE reviews DROP COLUMN gm_replied_at;
    DROP TABLE admin_log;
    ALTER TABLE game_sessions DROP COLUMN reschedule_count;
    DROP TABLE review_prompts; ALTER TABLE email_outbox DROP COLUMN attempts; ALTER TABLE email_outbox DROP COLUMN retryable;
    DROP TABLE email_queue; ALTER TABLE users DROP COLUMN email_notifications;
    DROP TABLE feedback; ALTER TABLE users DROP COLUMN terms_accepted_at; ALTER TABLE users DROP COLUMN terms_version;
    DROP TABLE error_log;
    DROP TABLE game_question_messages; DROP TABLE game_questions; ALTER TABLE notifications DROP COLUMN question_id;
    DROP INDEX uq_users_calendar_token; ALTER TABLE users DROP COLUMN calendar_token;
    ALTER TABLE game_sessions DROP COLUMN cancel_reason;
    DROP TABLE session_reminders; ALTER TABLE users DROP COLUMN locale; ALTER TABLE users DROP COLUMN email_reminders;
    DROP TABLE rate_limits;
    ALTER TABLE games DROP COLUMN cover_image; ALTER TABLE users DROP COLUMN avatar_image;
    ALTER TABLE games DROP COLUMN genres; ALTER TABLE games DROP COLUMN styles;
    DROP TABLE lfg_replies; DROP TABLE lfg_posts; DROP TABLE saved_games; DROP TABLE gm_follows;
    ALTER TABLE games DROP COLUMN announced_at; ALTER TABLE notifications DROP COLUMN game_id; ALTER TABLE notifications DROP COLUMN post_id;
    DROP TABLE waitlist; ALTER TABLE bookings DROP COLUMN paid_marked_at;
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
