// Versioned schema migrations. Pure module (no runtime imports) so the
// upgrade planner is unit-testable.
//
// How it works
// - `PRAGMA user_version` is the migration ledger: it holds the version the DB is at.
// - Version 4 is the baseline: `SCHEMA_SQL` creates a complete v4 database.
// - Each later change adds an entry here, keyed by the version it produces,
//   AND updates SCHEMA_SQL (for fresh databases) AND bumps SCHEMA_VERSION.
// - Migrations must be safe to run on a real database: no data loss, and
//   idempotent where possible (IF NOT EXISTS).

export const BASELINE_VERSION = 4;

export const MIGRATIONS: Record<number, string> = {
  // v5: storage for fixed-window rate limiting (IMPROVEMENTS P1-9).
  5: `
    CREATE TABLE IF NOT EXISTS rate_limits (
      key          TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count        INTEGER NOT NULL
    );
  `,
  // v6: optional image paths for game covers and user avatars. Demo rows get the
  // bundled placeholder art (web/public/images); everything else keeps the
  // generated gradient / initials fallback. Frozen snapshot — do not edit.
  6: `
    ALTER TABLE games ADD COLUMN cover_image TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN avatar_image TEXT NOT NULL DEFAULT '';
    UPDATE games SET cover_image = '/images/covers/mercusuar-di-pulau-kabut.svg' WHERE slug = 'mercusuar-di-pulau-kabut' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/darah-di-balik-tirai-beludru.svg' WHERE slug = 'darah-di-balik-tirai-beludru' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/signal-from-tartarus-station.svg' WHERE slug = 'signal-from-tartarus-station' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/naga-naga-hutan-bara-petualangan-pemula.svg' WHERE slug = 'naga-naga-hutan-bara-petualangan-pemula' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/mahkota-yang-terbelah.svg' WHERE slug = 'mahkota-yang-terbelah' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/panen-harapan.svg' WHERE slug = 'panen-harapan' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/doskvol-setelah-gelap.svg' WHERE slug = 'doskvol-setelah-gelap' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/neon-run-satu-malam-di-neo-surabaya.svg' WHERE slug = 'neon-run-satu-malam-di-neo-surabaya' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/abomination-vaults.svg' WHERE slug = 'abomination-vaults' AND cover_image = '';
    UPDATE games SET cover_image = '/images/covers/starfall-salvage.svg' WHERE slug = 'starfall-salvage' AND cover_image = '';
    UPDATE users SET avatar_image = '/images/gms/raka.svg' WHERE email = 'gm@questboard.test' AND avatar_image = '';
    UPDATE users SET avatar_image = '/images/gms/dewi.svg' WHERE email = 'dewi@questboard.test' AND avatar_image = '';
    UPDATE users SET avatar_image = '/images/gms/bima.svg' WHERE email = 'bima@questboard.test' AND avatar_image = '';
    UPDATE users SET avatar_image = '/images/gms/nadia.svg' WHERE email = 'nadia@questboard.test' AND avatar_image = '';
  `,
  // v7: game categories (genres, play styles) + "hire a GM" requests, offers and
  // the private requester↔GM thread. Demo games get categories. Frozen snapshot.
  7: `
    ALTER TABLE games ADD COLUMN genres TEXT NOT NULL DEFAULT '';
    ALTER TABLE games ADD COLUMN styles TEXT NOT NULL DEFAULT '';
    UPDATE games SET genres = 'horror,mystery', styles = 'roleplay-heavy,puzzle-mystery' WHERE slug = 'mercusuar-di-pulau-kabut' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'horror,urban', styles = 'roleplay-heavy,narrative' WHERE slug = 'darah-di-balik-tirai-beludru' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'sci-fi,horror', styles = 'theater-of-mind,puzzle-mystery' WHERE slug = 'signal-from-tartarus-station' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'fantasy', styles = 'rule-of-cool,theater-of-mind' WHERE slug = 'naga-naga-hutan-bara-petualangan-pemula' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'fantasy', styles = 'roleplay-heavy,sandbox' WHERE slug = 'mahkota-yang-terbelah' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'fantasy,cozy', styles = 'roleplay-heavy,narrative' WHERE slug = 'panen-harapan' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'dark-fantasy,urban', styles = 'sandbox,narrative' WHERE slug = 'doskvol-setelah-gelap' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'cyberpunk,sci-fi', styles = 'combat-heavy,rule-of-cool' WHERE slug = 'neon-run-satu-malam-di-neo-surabaya' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'fantasy,horror', styles = 'tactical,dungeon-crawl' WHERE slug = 'abomination-vaults' AND genres = '' AND styles = '';
    UPDATE games SET genres = 'sci-fi', styles = 'combat-heavy,rule-of-cool' WHERE slug = 'starfall-salvage' AND genres = '' AND styles = '';
    CREATE TABLE IF NOT EXISTS gm_requests (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gm_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,     -- set = direct request to one GM
      title            TEXT NOT NULL,
      system           TEXT NOT NULL DEFAULT '',
      group_size       INTEGER NOT NULL CHECK (group_size BETWEEN 1 AND 12),
      experience_level TEXT NOT NULL DEFAULT 'any' CHECK (experience_level IN ('any','beginner','experienced')),
      language         TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id','en','both')),
      location_type    TEXT NOT NULL DEFAULT 'online' CHECK (location_type IN ('online','in_person')),
      city             TEXT NOT NULL DEFAULT '',
      schedule         TEXT NOT NULL DEFAULT '',
      budget_idr       INTEGER NOT NULL DEFAULT 0 CHECK (budget_idr >= 0),
      details          TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','closed')),
      matched_gm_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gm_requests_status ON gm_requests(status, created_at);
    CREATE TABLE IF NOT EXISTS gm_request_offers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES gm_requests(id) ON DELETE CASCADE,
      gm_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message     TEXT NOT NULL,
      price_idr   INTEGER NOT NULL DEFAULT 0 CHECK (price_idr >= 0),
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (request_id, gm_id)
    );
    CREATE TABLE IF NOT EXISTS gm_request_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES gm_requests(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gm_request_messages ON gm_request_messages(request_id, created_at);
  `,
  // v0.9.1: in-app notifications.
  8: `
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,             -- lib/notifications.ts NotificationKind
      actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      request_id  INTEGER REFERENCES gm_requests(id) ON DELETE CASCADE,
      session_id  INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      read_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
  `,
  // v0.11 iteration 3: email verification, password reset, account deletion.
  9: `
    ALTER TABLE users ADD COLUMN email_verified_at TEXT;
    ALTER TABLE users ADD COLUMN deleted_at TEXT;
    -- Accounts that existed before verification was introduced are grandfathered in.
    UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('reset','verify')),
      token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256 of the emailed token; the token itself is never stored
      expires_at  TEXT NOT NULL,
      used_at     TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);
    CREATE TABLE IF NOT EXISTS email_outbox (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      to_address  TEXT NOT NULL,
      subject     TEXT NOT NULL,
      body_text   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      sent_at     TEXT,
      error       TEXT
    );
  `,
  // v0.11 iteration 4: reports & moderation.
  10: `
    ALTER TABLE users ADD COLUMN suspended_at TEXT;
    ALTER TABLE notifications ADD COLUMN report_id INTEGER;
    CREATE TABLE IF NOT EXISTS reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type     TEXT NOT NULL CHECK (target_type IN ('game','review','message','request_message','user')),
      target_id       INTEGER NOT NULL,
      target_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason          TEXT NOT NULL CHECK (reason IN ('scam','harassment','inappropriate','spam','misleading','other')),
      details         TEXT NOT NULL DEFAULT '',
      snapshot        TEXT NOT NULL,          -- what the content said when it was reported
      href            TEXT NOT NULL,          -- where it lives (for the moderator)
      status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
      decision        TEXT CHECK (decision IN ('remove','suspend','dismiss')),
      note            TEXT NOT NULL DEFAULT '',
      resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      resolved_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
  `,
  // v0.11 iteration 5: waitlist and the GM's paid marker.
  11: `
    ALTER TABLE bookings ADD COLUMN paid_marked_at TEXT;
    CREATE TABLE IF NOT EXISTS waitlist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      player_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status      TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','claimed','expired','left')),
      offered_at  TEXT,
      expires_at  TEXT,                        -- an offer holds the seat until then
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (session_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_waitlist_session ON waitlist(session_id, status, created_at);
  `,
  // v0.11 iteration 6: notice board, saved games, follows; reports accept board content.
  12: `
    ALTER TABLE games ADD COLUMN announced_at TEXT;
    -- Games already live before follows existed count as announced.
    UPDATE games SET announced_at = created_at WHERE status = 'published';
    ALTER TABLE notifications ADD COLUMN game_id INTEGER;
    ALTER TABLE notifications ADD COLUMN post_id INTEGER;
    CREATE TABLE reports_v12 (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type     TEXT NOT NULL CHECK (target_type IN ('game','review','message','request_message','user','lfg_post','lfg_reply')),
      target_id       INTEGER NOT NULL,
      target_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason          TEXT NOT NULL CHECK (reason IN ('scam','harassment','inappropriate','spam','misleading','other')),
      details         TEXT NOT NULL DEFAULT '',
      snapshot        TEXT NOT NULL,          -- what the content said when it was reported
      href            TEXT NOT NULL,          -- where it lives (for the moderator)
      status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
      decision        TEXT CHECK (decision IN ('remove','suspend','dismiss')),
      note            TEXT NOT NULL DEFAULT '',
      resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      resolved_at     TEXT
    );
    INSERT INTO reports_v12 (id, reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href, status, decision, note, resolved_by, created_at, resolved_at) SELECT id, reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href, status, decision, note, resolved_by, created_at, resolved_at FROM reports;
    DROP TABLE reports;
    ALTER TABLE reports_v12 RENAME TO reports;
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
    CREATE TABLE IF NOT EXISTS lfg_posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('lf_group','lf_players')),
      title         TEXT NOT NULL,
      system        TEXT NOT NULL DEFAULT '',
      location_type TEXT NOT NULL DEFAULT 'online' CHECK (location_type IN ('online','in_person')),
      city          TEXT NOT NULL DEFAULT '',
      language      TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id','en','both')),
      schedule      TEXT NOT NULL DEFAULT '',
      spots         INTEGER NOT NULL DEFAULT 0 CHECK (spots BETWEEN 0 AND 8),
      body          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      expires_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lfg_posts_open ON lfg_posts(status, expires_at, created_at);
    CREATE TABLE IF NOT EXISTS lfg_replies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id     INTEGER NOT NULL REFERENCES lfg_posts(id) ON DELETE CASCADE,
      author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lfg_replies_post ON lfg_replies(post_id, created_at);
    CREATE TABLE IF NOT EXISTS saved_games (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS gm_follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gm_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (follower_id, gm_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gm_follows_gm ON gm_follows(gm_id);
  `,
  13: `
    ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','id'));
    ALTER TABLE users ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS session_reminders (
      session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL CHECK (kind IN ('24h','1h')),
      sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (session_id, user_id, kind)
    );
  `,
  14: `
    ALTER TABLE game_sessions ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '';
  `,
  15: `
    ALTER TABLE users ADD COLUMN calendar_token TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_calendar_token ON users(calendar_token);
  `,
  16: `
    ALTER TABLE notifications ADD COLUMN question_id INTEGER;
    CREATE TABLE IF NOT EXISTS game_questions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_message_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (game_id, player_id)
    );
    CREATE TABLE IF NOT EXISTS game_question_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES game_questions(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gqm_question ON game_question_messages(question_id, created_at);
  `,
  17: `
    CREATE TABLE IF NOT EXISTS error_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      message     TEXT NOT NULL,
      digest      TEXT NOT NULL DEFAULT '',
      method      TEXT NOT NULL DEFAULT '',
      path        TEXT NOT NULL DEFAULT '',   -- without the query string (it can hold tokens)
      route_path  TEXT NOT NULL DEFAULT '',
      route_type  TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at);
  `,
  18: `
    ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
    ALTER TABLE users ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email      TEXT NOT NULL DEFAULT '',     -- optional reply address (signed-out senders)
      kind       TEXT NOT NULL CHECK (kind IN ('bug','idea','other')),
      body       TEXT NOT NULL,
      page       TEXT NOT NULL DEFAULT '',     -- where they came from (path only)
      status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
  `,
  19: `
    ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS email_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `,
  20: `
    ALTER TABLE email_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE email_outbox ADD COLUMN retryable INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS review_prompts (
      game_id   INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sent_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (game_id, player_id)
    );
  `,
  21: `
    ALTER TABLE game_sessions ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0;
  `,
  22: `
    CREATE TABLE IF NOT EXISTS admin_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action         TEXT NOT NULL,          -- lib/moderation.ts AdminAction
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      detail         TEXT NOT NULL DEFAULT '',
      created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_log_created ON admin_log(created_at);
  `,
  23: `
    ALTER TABLE reviews ADD COLUMN gm_reply TEXT NOT NULL DEFAULT '';
    ALTER TABLE reviews ADD COLUMN gm_replied_at TEXT;
  `,
  24: `
    ALTER TABLE reviews ADD COLUMN edited_at TEXT;
    -- A CHECK constraint can't be altered in SQLite: rebuild reports to accept review_reply.
    CREATE TABLE reports_v24 (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type     TEXT NOT NULL CHECK (target_type IN ('game','review','review_reply','message','request_message','user','lfg_post','lfg_reply')),
      target_id       INTEGER NOT NULL,
      target_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason          TEXT NOT NULL CHECK (reason IN ('scam','harassment','inappropriate','spam','misleading','other')),
      details         TEXT NOT NULL DEFAULT '',
      snapshot        TEXT NOT NULL,
      href            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
      decision        TEXT CHECK (decision IN ('remove','suspend','dismiss')),
      note            TEXT NOT NULL DEFAULT '',
      resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      resolved_at     TEXT
    );
    INSERT INTO reports_v24 (id, reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href, status, decision, note, resolved_by, created_at, resolved_at) SELECT id, reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href, status, decision, note, resolved_by, created_at, resolved_at FROM reports;
    DROP TABLE reports;
    ALTER TABLE reports_v24 RENAME TO reports;
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
  `,
  25: `
    ALTER TABLE lfg_posts ADD COLUMN expiry_notified_at TEXT;
  `,
  26: `
    CREATE TABLE IF NOT EXISTS uploads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL CHECK (kind IN ('cover','portrait')),
      file       TEXT NOT NULL UNIQUE,   -- random name, served at /uploads/<file>
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
  `,
};

export type UpgradePlan =
  | { kind: "none" }
  | { kind: "fresh" }
  | { kind: "migrate"; steps: number[] }
  | { kind: "reset"; reason: string }
  | { kind: "error"; reason: string };

/**
 * Decide how to bring a database at `current` up to `target`.
 * - Empty DB: create it fresh.
 * - Every step has a migration: migrate, keeping the data.
 * - No migration path: in development, back up and reset (demo data only).
 *   In production, refuse, because wiping real data is never acceptable.
 */
export function planSchemaUpgrade(opts: {
  current: number;
  target: number;
  hasTables: boolean;
  isProduction: boolean;
  migrations?: Record<number, string>;
}): UpgradePlan {
  const { current, target, hasTables, isProduction } = opts;
  const migrations = opts.migrations ?? MIGRATIONS;
  if (!hasTables) return { kind: "fresh" };
  if (current === target) return { kind: "none" };
  if (current > target) return { kind: "error", reason: `Database schema v${current} is newer than this app (v${target}).` };

  const steps: number[] = [];
  for (let v = current + 1; v <= target; v++) {
    if (!(v in migrations)) {
      const reason = `No migration from v${v - 1} to v${v}.`;
      return isProduction ? { kind: "error", reason: `${reason} Refusing to reset a production database.` } : { kind: "reset", reason };
    }
    steps.push(v);
  }
  return { kind: "migrate", steps };
}
