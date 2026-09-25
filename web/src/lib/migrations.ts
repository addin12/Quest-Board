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
