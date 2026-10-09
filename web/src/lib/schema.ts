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
// v18: feedback (the footer's "Send feedback" form) + users.terms_accepted_at / terms_version (consent record).
// v19: email_queue (emails for important notifications) + users.email_notifications.
// v20: email_outbox.attempts / retryable (delivery retries) + review_prompts (once per player per game).
// v21: game_sessions.reschedule_count (a GM changed the time; the calendar SEQUENCE).
// v22: admin_log (who suspended, verified or decided what — shown on the admin home).
// v23: reviews.gm_reply / gm_replied_at (the GM's public answer to a review).
// v24: reports accept review_reply (a GM's reply to a review) + reviews.edited_at.
// v25: lfg_posts.expiry_notified_at (the author was told the notice comes down soon).
// v26: uploads (pictures people uploaded for covers and portraits).
// v27: app_state (named values kept between runs, e.g. the last error digest).
// v28: two-step login (users.totp_*, login_challenges).
// v29: payment_changes (when a GM changed their payment details).
// v30: where you're logged in (auth_sessions.device/created_at/last_seen_at, login_devices).
// v31: automatic scam flags (reports.reporter_id may be NULL).
// v32: users.legal_seen_version (the "we've updated our Privacy Policy" banner).
// v33: users.time_zone (emails show times in the reader's zone: WIB, WITA, WIT…).
// v34: email_outbox.headers (List-Unsubscribe survives a retry).
// v35: email_outbox.provider / optional / expires_at / deferred (a second provider, daily limits),
//      email_changes (changing the login email: a link to the new address).
// v36: email_suppressions (bounced / spam-reported addresses) + email_outbox.suppressed.
// v37: gm_invites (founding-GM invitation links) + launch_notify (pre-launch "tell me when it opens").
// v38: gm_profiles.refund_terms / payment_qr (QRIS picture), games.table_link, uploads kind 'qris'.
// v39: games.venue_name / venue_maps_url (where an in-person game meets, with a Google Maps link).
// v40: bookings.player_paid_at (the player says "I've sent the payment"; the GM still confirms).
// v41: an index on every foreign key; security_events (append-only); web_vitals (real visitors' page speed).
// v42: security_counters (failed logins per account per hour, so the security log can't be flooded).
export const SCHEMA_VERSION = 42;

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
  calendar_token TEXT,                       -- v15: secret for /api/calendar/<id>.<token>.ics; NULL until created
  terms_accepted_at TEXT,                    -- v18: when they agreed to the Terms & Privacy Policy at sign-up
  terms_version  TEXT NOT NULL DEFAULT '',   -- v18: which version of those texts (LEGAL_VERSION)
  email_notifications INTEGER NOT NULL DEFAULT 1, -- v19: email me about bookings, questions and offers
  totp_secret     TEXT,                       -- v28: two-step login secret (base32); set during setup
  totp_enabled_at TEXT,                       -- v28: when two-step login was turned on (NULL = off)
  totp_last_step  INTEGER NOT NULL DEFAULT -1, -- v28: last code's 30-second step (each code works once)
  legal_seen_version TEXT NOT NULL DEFAULT '', -- v32: the Terms/Privacy version whose update banner they've seen
  time_zone TEXT NOT NULL DEFAULT 'Asia/Jakarta' -- v33: IANA zone for times in emails (lib/time-zones.ts)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_calendar_token ON users(calendar_token);

CREATE TABLE IF NOT EXISTS gm_profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline         TEXT NOT NULL DEFAULT '',
  systems          TEXT NOT NULL DEFAULT '',   -- comma separated
  years_experience INTEGER NOT NULL DEFAULT 0,
  location         TEXT NOT NULL DEFAULT 'Online', -- GM's city (e.g. Jakarta) or 'Online'
  verified         INTEGER NOT NULL DEFAULT 0,
  payment_info     TEXT NOT NULL DEFAULT '',    -- how players pay the GM directly; shown to booked players only
  refund_terms     TEXT NOT NULL DEFAULT '',    -- v38: cancellation & refund terms, shown to everyone before booking
  payment_qr       TEXT NOT NULL DEFAULT ''     -- v38: their QRIS code (/uploads/… of kind 'qris'), served to booked players only
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at   TEXT,                        -- v30: when this login happened
  last_seen_at TEXT,                        -- v30: last request (updated at most every 10 minutes)
  device       TEXT NOT NULL DEFAULT ''     -- v30: "Chrome · Android"
);

-- v30: browsers this account has logged in with (for "new device" emails).
CREATE TABLE IF NOT EXISTS login_devices (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash   TEXT NOT NULL,                -- sha256 of the qb_device cookie
  device        TEXT NOT NULL DEFAULT '',     -- "Chrome · Android" (lib/device.ts)
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, device_hash)
);

-- v28: a password checked, waiting for the two-step code (10 minutes).
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,               -- sha256 of the qb_2fa cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  next_path  TEXT NOT NULL DEFAULT '',       -- where to go after the code
  attempts   INTEGER NOT NULL DEFAULT 0,     -- wrong codes so far (5 ends the step)
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
  table_link         TEXT NOT NULL DEFAULT '',   -- v38: Discord/Meet link for online games, booked players only
  venue_name         TEXT NOT NULL DEFAULT '',   -- v39: in person: the café or game store (public)
  venue_maps_url     TEXT NOT NULL DEFAULT '',   -- v39: its Google Maps share link (public)
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
  cancel_reason    TEXT NOT NULL DEFAULT '',   -- v14: the GM's message to booked players when cancelling
  reschedule_count INTEGER NOT NULL DEFAULT 0  -- v21: times the GM changed the time (iCalendar SEQUENCE)
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
  paid_marked_at TEXT,                        -- v11: the GM ticked "paid ✓" (payment happens off-platform)
  player_paid_at TEXT                         -- v40: the player said "I've sent the payment" (the GM confirms)
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
  gm_reply   TEXT NOT NULL DEFAULT '',      -- v23: the game's GM answers publicly ('' = no reply)
  gm_replied_at TEXT,
  edited_at  TEXT,                          -- v24: the reviewer changed it after posting
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

-- v18: feedback from the footer form ("Send feedback").
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

-- v19: important notifications waiting to be emailed (written in the same transaction as the notification).
CREATE TABLE IF NOT EXISTS email_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- v20: "How was it? Leave a review" — asked once per player per game.
CREATE TABLE IF NOT EXISTS review_prompts (
  game_id   INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (game_id, player_id)
);

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
CREATE TABLE IF NOT EXISTS email_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email   TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256 of the emailed token
  expires_at  TEXT NOT NULL,
  used_at     TEXT,                     -- confirmed, replaced by a newer request, or cancelled by a password reset
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_email_changes_user ON email_changes(user_id);
CREATE TABLE IF NOT EXISTS email_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at     TEXT,
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,  -- v20: delivery attempts (retried by the cron)
  retryable   INTEGER NOT NULL DEFAULT 1,  -- v20: 0 when the stored copy had its one-time link blanked
  headers     TEXT,                        -- v34: extra headers as JSON (List-Unsubscribe), or NULL
  provider    TEXT,                        -- v35: who accepted it ('resend' | 'brevo'), counted for daily limits
  optional    INTEGER NOT NULL DEFAULT 0,  -- v35: 1 = may wait for room under the daily limit (notifications, reminders)
  expires_at  TEXT,                        -- v35: not worth sending after this, or NULL
  deferred    INTEGER NOT NULL DEFAULT 0,  -- v35: 1 = waiting for room under the daily limit (not a failure)
  suppressed  INTEGER NOT NULL DEFAULT 0   -- v36: 1 = not sent: optional, and the address bounced or reported spam
);

CREATE TABLE IF NOT EXISTS gm_invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256 of the link's token
  note        TEXT NOT NULL DEFAULT '', -- who it's for (admins only)
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL,
  used_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at     TEXT
);
CREATE TABLE IF NOT EXISTS launch_notify (
  email       TEXT PRIMARY KEY COLLATE NOCASE, -- asked to be told when Quest Board opens (deleted once told)
  lang        TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','id')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS email_suppressions (
  email       TEXT PRIMARY KEY COLLATE NOCASE,
  reason      TEXT NOT NULL CHECK (reason IN ('bounce','complaint')),
  provider    TEXT NOT NULL,              -- who told us ('resend' | 'brevo')
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id     INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = an automatic flag (v31, lib/scam-signals.ts)
  target_type     TEXT NOT NULL CHECK (target_type IN ('game','review','review_reply','message','request_message','user','lfg_post','lfg_reply')),
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
  expires_at    TEXT NOT NULL,
  expiry_notified_at TEXT                 -- v25: author reminded it comes down soon (cleared when kept up)
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

-- v22: moderator actions, for accountability between admins.
CREATE TABLE IF NOT EXISTS admin_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,          -- lib/moderation.ts AdminAction
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  detail         TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_log_created ON admin_log(created_at);

-- v26: pictures people uploaded (game covers, portraits), re-encoded to WebP; files in QUESTBOARD_UPLOAD_DIR.
CREATE TABLE IF NOT EXISTS uploads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('cover','portrait','qris')),
  file       TEXT NOT NULL UNIQUE,   -- random name, served at /uploads/<file>
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);

-- v27: small named values the app keeps between runs (e.g. when the last error digest was sent).
CREATE TABLE IF NOT EXISTS app_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- v29: each change of a GM's payment details (players are warned for 14 days).
CREATE TABLE IF NOT EXISTS payment_changes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_changes_user ON payment_changes(user_id, changed_at);

-- v41: an index on every foreign key (deletes cascade through them, and most are looked up).
CREATE INDEX IF NOT EXISTS idx_fk_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_login_challenges_user_id ON login_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_reviews_player_id ON reviews(player_id);
CREATE INDEX IF NOT EXISTS idx_fk_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_gm_requests_matched_gm_id ON gm_requests(matched_gm_id);
CREATE INDEX IF NOT EXISTS idx_fk_gm_requests_gm_id ON gm_requests(gm_id);
CREATE INDEX IF NOT EXISTS idx_fk_gm_requests_requester_id ON gm_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_fk_gm_request_offers_gm_id ON gm_request_offers(gm_id);
CREATE INDEX IF NOT EXISTS idx_fk_gm_request_messages_user_id ON gm_request_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_session_id ON notifications(session_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_request_id ON notifications(request_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_actor_id ON notifications(actor_id);
CREATE INDEX IF NOT EXISTS idx_fk_game_questions_player_id ON game_questions(player_id);
CREATE INDEX IF NOT EXISTS idx_fk_game_question_messages_user_id ON game_question_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_email_queue_notification_id ON email_queue(notification_id);
CREATE INDEX IF NOT EXISTS idx_fk_review_prompts_player_id ON review_prompts(player_id);
CREATE INDEX IF NOT EXISTS idx_fk_session_reminders_user_id ON session_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_gm_invites_used_by ON gm_invites(used_by);
CREATE INDEX IF NOT EXISTS idx_fk_gm_invites_created_by ON gm_invites(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_reports_resolved_by ON reports(resolved_by);
CREATE INDEX IF NOT EXISTS idx_fk_reports_target_owner_id ON reports(target_owner_id);
CREATE INDEX IF NOT EXISTS idx_fk_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_fk_waitlist_player_id ON waitlist(player_id);
CREATE INDEX IF NOT EXISTS idx_fk_lfg_posts_author_id ON lfg_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_fk_lfg_replies_author_id ON lfg_replies(author_id);
CREATE INDEX IF NOT EXISTS idx_fk_saved_games_game_id ON saved_games(game_id);
CREATE INDEX IF NOT EXISTS idx_fk_admin_log_target_user_id ON admin_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_admin_log_admin_id ON admin_log(admin_id);

-- v41: security events, append-only. No foreign key: the record outlives an account. Rows can't be
-- changed, and can't be deleted until they're 180 days old (the retention cron then removes them).
CREATE TABLE IF NOT EXISTS security_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                 -- lib/security-log.ts SecurityEventKind
  user_id    INTEGER,                       -- the account it's about (NULL: no such account)
  detail     TEXT NOT NULL DEFAULT '',      -- never a password, code or token
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at);
CREATE TRIGGER IF NOT EXISTS security_events_no_update BEFORE UPDATE ON security_events
BEGIN SELECT RAISE(ABORT, 'security_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS security_events_keep BEFORE DELETE ON security_events
WHEN old.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 days')
BEGIN SELECT RAISE(ABORT, 'security_events rows are kept for 180 days'); END;

-- v41: Core Web Vitals from real visitors (components/web-vitals.tsx → /api/vitals). Only the page's route
-- pattern, the metric and its value: no account, no address, no query string. Kept 30 days.
CREATE TABLE IF NOT EXISTS web_vitals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page       TEXT NOT NULL,                 -- route pattern, e.g. /games/[slug] (lib/vitals.ts)
  metric     TEXT NOT NULL CHECK (metric IN ('LCP','INP','CLS','FCP','TTFB')),
  value      REAL NOT NULL CHECK (value >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_web_vitals_created ON web_vitals(created_at, page, metric);

-- v42: how many failed logins / wrong codes an account (0 = no such account) had in each hour. The
-- security log records the first of each hour; this table counts the rest, so a script trying passwords
-- can't fill the append-only log. Kept 180 days, like the log.
CREATE TABLE IF NOT EXISTS security_counters (
  kind    TEXT NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 0,
  hour    TEXT NOT NULL,                     -- "2026-10-09T13" (UTC)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, user_id, hour)
);
CREATE INDEX IF NOT EXISTS idx_security_counters_hour ON security_counters(hour);
`;
