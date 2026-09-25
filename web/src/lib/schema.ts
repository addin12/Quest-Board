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
export const SCHEMA_VERSION = 8;

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
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

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
  status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled'))
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
  cancelled_at TEXT
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
  read_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
`;
