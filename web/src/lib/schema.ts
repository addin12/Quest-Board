// SQLite schema for Quest Board. SCHEMA_SQL always describes the CURRENT
// schema and is used to create fresh databases. Existing databases are
// upgraded by the ordered steps in migrations.ts (see db.ts).
// To change the schema: edit SCHEMA_SQL, add a migration, bump SCHEMA_VERSION.
// See docs/05-data-model.md for the entity reference.

// v2: IDR, no payments, bilingual. v3: D&D 5e split into 5e (2014) and 5.5e (2024) (re-seed).
// v4: gm_profiles.timezone replaced by gm_profiles.location (city or "Online"). Migration baseline.
// v5: rate_limits table (first real migration — data is preserved).
// v6: games.cover_image, users.avatar_image (optional image paths; '' = generated fallback).
// v7: games.genres / games.styles (CSV of category keys) + gm_requests, gm_request_offers, gm_request_messages.
// v8: notifications (in-app).
// v9: users.email_verified_at / deleted_at + auth_tokens (reset, verify) + email_outbox.
// v10: reports + users.suspended_at + notifications.report_id (moderation).
// v11: waitlist + bookings.paid_marked_at (GM "paid ✓").
// v12: Tavern Notice Board (lfg_posts, lfg_replies), saved_games, gm_follows, games.announced_at,
//      notifications.game_id/post_id, reports accept lfg_post/lfg_reply.
// v13: session reminders (session_reminders) + users.locale / users.email_reminders.
// v14: game_sessions.cancel_reason (the GM's message to players when cancelling).
// v15: users.calendar_token (private calendar feed URL).
// v16: game_questions + game_question_messages (ask the GM before booking), notifications.question_id.
// v17: error_log (server errors, shown in /admin/errors).
export const SCHEMA_VERSION = 17;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','gm','admin')),
  avatar_hue    INTEGER NOT NULL DEFAULT 260,
  bio           TEXT NOT NULL DEFAULT '',
  avatar_image  TEXT NOT NULL DEFAULT '',   -- path/URL of a portrait; '' = initials avatar
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  email_verified_at TEXT,                  -- NULL until the emailed link is opened (v9)
  deleted_at    TEXT,                      -- set when the person deleted their account; data scrubbed (v9)
  suspended_at  TEXT,                      -- set by a moderator: no login, profile hidden (v10)
  locale        TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','id')), -- language of emails/reminders (v13)
  email_reminders INTEGER NOT NULL DEFAULT 1, -- email me before my sessions (v13)
  calendar_token TEXT                        -- v15: secret for /api/calendar/<token>.ics; NULL until created
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_calendar_token ON users(calendar_token);

CREATE TABLE IF NOT EXISTS gm_profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline         TEXT NOT NULL DEFAULT '',
  systems          TEXT NOT NULL DEFAULT '',   -- comma separated
  years_experience INTEGER NOT NULL DEFAULT 0,
  location         TEXT NOT NULL DEFAULT 'Online', -- GM's city (e.g. Jakarta) or 'Online'
  verified         INTEGER NOT NULL DEFAULT 0,
  payment_info     TEXT NOT NULL DEFAULT ''     -- how players pay the GM directly; shown to booked players only
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  gm_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  system             TEXT NOT NULL,
  summary            TEXT NOT NULL,
  description        TEXT NOT NULL,
  format             TEXT NOT NULL CHECK (format IN ('one_shot','campaign')),
  location_type      TEXT NOT NULL CHECK (location_type IN ('online','in_person')),
  language           TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id','en','both')),
  platform           TEXT NOT NULL DEFAULT '',
  city               TEXT NOT NULL DEFAULT '',
  price_idr          INTEGER NOT NULL CHECK (price_idr >= 0),   -- whole Rupiah, paid to the GM directly
  seats_total        INTEGER NOT NULL CHECK (seats_total BETWEEN 1 AND 12),
  experience_level   TEXT NOT NULL DEFAULT 'any' CHECK (experience_level IN ('any','beginner','experienced')),
  min_age            INTEGER NOT NULL DEFAULT 18,
  content_warnings   TEXT NOT NULL DEFAULT '',
  safety_tools       TEXT NOT NULL DEFAULT '',
  tags               TEXT NOT NULL DEFAULT '',   -- comma separated
  cover_hue          INTEGER NOT NULL DEFAULT 260,
  cover_image        TEXT NOT NULL DEFAULT '',  -- path/URL of cover art; '' = generated gradient
  genres             TEXT NOT NULL DEFAULT '',  -- CSV of genre keys (lib/categories.ts)
  styles             TEXT NOT NULL DEFAULT '',  -- CSV of play-style keys
  announced_at       TEXT,                      -- v12: followers were told about this game
  status             TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_games_gm ON games(gm_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

CREATE TABLE IF NOT EXISTS game_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  starts_at        TEXT NOT NULL,              -- ISO-8601 UTC
  duration_minutes INTEGER NOT NULL DEFAULT 180,
  status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  cancel_reason    TEXT NOT NULL DEFAULT ''    -- v14: the GM's message to booked players when cancelling
);
CREATE INDEX IF NOT EXISTS idx_sessions_game ON game_sessions(game_id, starts_at);

-- A booking is a seat reservation. No money moves through Quest Board.
CREATE TABLE IF NOT EXISTS bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  price_idr    INTEGER NOT NULL,              -- price shown when the seat was reserved
  cancelled_by TEXT CHECK (cancelled_by IN ('player','gm')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cancelled_at TEXT,
  paid_marked_at TEXT                         -- v11: the GM ticked "paid ✓" (payment happens off-platform)
);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_bookings_player ON bookings(player_id);
-- A player may hold at most one active seat per session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_active
  ON bookings(session_id, player_id) WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_game ON messages(game_id, created_at);

-- Fixed-window rate limiting (key = "<bucket>:<identity>").
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- "Hire a GM": players post requests (open, or direct to one GM), GMs send offers,
-- the requester picks one, then both talk in a private thread.
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

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,             -- lib/notifications.ts NotificationKind
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  request_id  INTEGER REFERENCES gm_requests(id) ON DELETE CASCADE,
  session_id  INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at     TEXT,
  report_id   INTEGER,                   -- v10: report_new / report_resolved
  game_id     INTEGER,                   -- v12: followed_gm_game
  post_id     INTEGER,                   -- v12: lfg_reply
  question_id INTEGER                    -- v16: game_question
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);

-- v16: a private player ↔ GM conversation about one game, before booking.
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

-- v17: server errors captured by src/instrumentation.ts (no headers, cookies or query strings).
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

-- v13: one row per reminder sent, so each goes out exactly once.
CREATE TABLE IF NOT EXISTS session_reminders (
  session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('24h','1h')),
  sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (session_id, user_id, kind)
);

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

CREATE TABLE IF NOT EXISTS reports (
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
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

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
`;
