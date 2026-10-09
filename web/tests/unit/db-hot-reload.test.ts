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
const UNDO_LATEST = "DROP INDEX idx_fk_auth_sessions_user_id; DROP INDEX idx_fk_login_challenges_user_id; DROP INDEX idx_fk_reviews_player_id; DROP INDEX idx_fk_messages_user_id; DROP INDEX idx_fk_gm_requests_matched_gm_id; DROP INDEX idx_fk_gm_requests_gm_id; DROP INDEX idx_fk_gm_requests_requester_id; DROP INDEX idx_fk_gm_request_offers_gm_id; DROP INDEX idx_fk_gm_request_messages_user_id; DROP INDEX idx_fk_notifications_session_id; DROP INDEX idx_fk_notifications_request_id; DROP INDEX idx_fk_notifications_actor_id; DROP INDEX idx_fk_game_questions_player_id; DROP INDEX idx_fk_game_question_messages_user_id; DROP INDEX idx_fk_feedback_user_id; DROP INDEX idx_fk_email_queue_notification_id; DROP INDEX idx_fk_review_prompts_player_id; DROP INDEX idx_fk_session_reminders_user_id; DROP INDEX idx_fk_gm_invites_used_by; DROP INDEX idx_fk_gm_invites_created_by; DROP INDEX idx_fk_reports_resolved_by; DROP INDEX idx_fk_reports_target_owner_id; DROP INDEX idx_fk_reports_reporter_id; DROP INDEX idx_fk_waitlist_player_id; DROP INDEX idx_fk_lfg_posts_author_id; DROP INDEX idx_fk_lfg_replies_author_id; DROP INDEX idx_fk_saved_games_game_id; DROP INDEX idx_fk_admin_log_target_user_id; DROP INDEX idx_fk_admin_log_admin_id; DROP TABLE security_events; DROP TABLE web_vitals;";
const latestIsBack = (conn: ReturnType<typeof db>) => conn.prepare("SELECT kind FROM security_events LIMIT 1").all();

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
