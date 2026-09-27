import "server-only";
import { db } from "./db";
import { escapeLike } from "./policy";
import { getMechanic, isGenre, isMechanic, isStyle, mechanicsForSystem, systemSlug } from "./categories";
import { SYSTEMS } from "./validation";

// Read-side queries. All SQL uses positional parameters.

export type GameLanguage = "id" | "en" | "both";

export type GameCard = {
  id: number;
  slug: string;
  title: string;
  system: string;
  summary: string;
  format: "one_shot" | "campaign";
  location_type: "online" | "in_person";
  language: GameLanguage;
  city: string;
  price_idr: number;
  seats_total: number;
  experience_level: "any" | "beginner" | "experienced";
  tags: string;
  cover_hue: number;
  cover_image: string;
  genres: string;
  styles: string;
  gm_id: number;
  gm_name: string;
  gm_hue: number;
  gm_image: string;
  gm_verified: number;
  avg_rating: number | null;
  review_count: number;
  next_session_id: number | null;
  next_session_at: string | null;
  next_session_seats_taken: number | null;
};

const CARD_SELECT = `
  SELECT g.id, g.slug, g.title, g.system, g.summary, g.format, g.location_type, g.language, g.city,
         g.price_idr, g.seats_total, g.experience_level, g.tags, g.cover_hue, g.cover_image, g.genres, g.styles,
         u.id AS gm_id, u.name AS gm_name, u.avatar_hue AS gm_hue, u.avatar_image AS gm_image, COALESCE(p.verified, 0) AS gm_verified,
         (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.game_id = g.id) AS avg_rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.game_id = g.id) AS review_count,
         ns.id AS next_session_id, ns.starts_at AS next_session_at,
         (SELECT COUNT(*) FROM bookings b WHERE b.session_id = ns.id AND b.status = 'confirmed') AS next_session_seats_taken
    FROM games g
    JOIN users u ON u.id = g.gm_id
    LEFT JOIN gm_profiles p ON p.user_id = u.id
    LEFT JOIN game_sessions ns ON ns.id = (
      SELECT s.id FROM game_sessions s
       WHERE s.game_id = g.id AND s.status = 'scheduled' AND s.starts_at > ?
       ORDER BY s.starts_at LIMIT 1)
`;

export type GameFilters = {
  q?: string;
  genre?: string;
  style?: string;
  system?: string;
  format?: string;
  location?: string;
  language?: string;
  level?: string;
  /** In-person games in this city (case-insensitive). */
  city?: string;
  /** One GM's games. */
  gm?: number;
  /** Games whose system is built on this mechanic (categories.ts MECHANICS). */
  mechanic?: string;
  maxPrice?: number;
  free?: boolean;
  sort?: "soonest" | "price_asc" | "price_desc" | "rating" | "newest";
};

/** WHERE clauses and their args for a set of browse filters (shared by search and count). */
function gameFilterSql(f: GameFilters): { where: string[]; args: (string | number)[] } {
  const where: string[] = ["g.status = 'published'"];
  const args: (string | number)[] = [];

  if (f.q) {
    // Escape % and _ so the keyword matches literally. The GM's own location counts too.
    const cols = ["g.title", "g.summary", "g.tags", "g.system", "u.name", "g.city", "p.location"];
    where.push(`(${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    const like = `%${escapeLike(f.q)}%`;
    args.push(...cols.map(() => like));
  }
  if (f.system) { where.push("g.system = ?"); args.push(f.system); }
  if (f.gm && Number.isInteger(f.gm)) { where.push("g.gm_id = ?"); args.push(f.gm); }
  if (f.mechanic && isMechanic(f.mechanic)) {
    const systems = getMechanic(f.mechanic).systems;
    where.push(`g.system IN (${systems.map(() => "?").join(",")})`);
    args.push(...systems);
  }
  // Category CSVs are matched with delimiters so "sci-fi" never matches "sci-fi-horror".
  if (f.genre && isGenre(f.genre)) { where.push("(',' || g.genres || ',') LIKE ?"); args.push(`%,${f.genre},%`); }
  if (f.style && isStyle(f.style)) { where.push("(',' || g.styles || ',') LIKE ?"); args.push(`%,${f.style},%`); }
  if (f.format === "one_shot" || f.format === "campaign") { where.push("g.format = ?"); args.push(f.format); }
  if (f.location === "online" || f.location === "in_person") { where.push("g.location_type = ?"); args.push(f.location); }
  if (f.city) { where.push("g.location_type = 'in_person' AND LOWER(TRIM(g.city)) = LOWER(TRIM(?))"); args.push(f.city); }
  // "Bahasa Indonesia" also matches bilingual tables, and likewise for English.
  if (f.language === "id" || f.language === "en") { where.push("g.language IN (?, 'both')"); args.push(f.language); }
  if (f.level === "beginner") where.push("g.experience_level IN ('beginner','any')");
  if (f.level === "experienced") where.push("g.experience_level IN ('experienced','any')");
  if (f.free) where.push("g.price_idr = 0");
  if (f.maxPrice != null && Number.isFinite(f.maxPrice)) { where.push("g.price_idr <= ?"); args.push(Math.round(f.maxPrice)); }
  return { where, args };
}

export function searchGames(f: GameFilters, limit = 60, offset = 0): GameCard[] {
  const { where, args } = gameFilterSql(f);
  const order = {
    soonest: "next_session_at IS NULL, next_session_at ASC",
    price_asc: "g.price_idr ASC",
    price_desc: "g.price_idr DESC",
    rating: "avg_rating IS NULL, avg_rating DESC, review_count DESC",
    newest: "g.created_at DESC",
  }[f.sort ?? "soonest"];

  // g.id breaks ties so pages never repeat or skip a game.
  return db()
    .prepare(`${CARD_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order}, g.id LIMIT ? OFFSET ?`)
    .all(new Date().toISOString(), ...args, limit, offset) as GameCard[];
}

/** How many published games match the filters (for "N games" and "Load more"). */
export function countGames(f: GameFilters): number {
  const { where, args } = gameFilterSql(f);
  return (db()
    .prepare(`SELECT COUNT(*) AS n FROM games g JOIN users u ON u.id = g.gm_id LEFT JOIN gm_profiles p ON p.user_id = u.id WHERE ${where.join(" AND ")}`)
    .get(...args) as { n: number }).n;
}

/** Cities with published in-person games, most games first (for the city filter). */
export function listCitiesInUse(): { city: string; n: number }[] {
  return db()
    .prepare(
      `SELECT MIN(TRIM(city)) AS city, COUNT(*) AS n FROM games
        WHERE status = 'published' AND location_type = 'in_person' AND TRIM(city) <> ''
        GROUP BY LOWER(TRIM(city)) ORDER BY n DESC, city`,
    )
    .all() as { city: string; n: number }[];
}

export type SystemSummary = { system: string; slug: string; n: number; cover: string; hue: number };

/** Published-game counts per system, genre and style (for the Browse hub). */
export function categorySummary(): { systems: SystemSummary[]; genres: Record<string, number>; styles: Record<string, number>; mechanics: Record<string, number> } {
  const rows = db()
    .prepare("SELECT system, genres, styles, cover_image, cover_hue FROM games WHERE status = 'published' ORDER BY created_at")
    .all() as { system: string; genres: string; styles: string; cover_image: string; cover_hue: number }[];
  const systems = new Map<string, SystemSummary>();
  const genres: Record<string, number> = {};
  const styles: Record<string, number> = {};
  const mechanics: Record<string, number> = {};
  for (const r of rows) {
    for (const m of mechanicsForSystem(r.system)) mechanics[m.key] = (mechanics[m.key] ?? 0) + 1;
    const cur = systems.get(r.system) ?? { system: r.system, slug: systemSlug(r.system), n: 0, cover: "", hue: r.cover_hue };
    cur.n++;
    if (!cur.cover && r.cover_image) cur.cover = r.cover_image;
    systems.set(r.system, cur);
    for (const g of r.genres.split(",").filter(Boolean)) genres[g] = (genres[g] ?? 0) + 1;
    for (const st of r.styles.split(",").filter(Boolean)) styles[st] = (styles[st] ?? 0) + 1;
  }
  return { systems: [...systems.values()].sort((a, b) => b.n - a.n || a.system.localeCompare(b.system)), genres, styles, mechanics };
}

/** Resolve a system URL slug to its name: any system with published games, or a known system (even with none yet). */
/** Published game cards for a list of ids, in that order (e.g. saved games). */
export function getGameCardsByIds(ids: number[]): GameCard[] {
  if (ids.length === 0) return [];
  const rows = db()
    .prepare(`${CARD_SELECT} WHERE g.status = 'published' AND g.id IN (${ids.map(() => "?").join(",")})`)
    .all(new Date().toISOString(), ...ids) as GameCard[];
  const byId = new Map(rows.map((g) => [g.id, g]));
  return ids.map((id) => byId.get(id)).filter((g): g is GameCard => !!g);
}

export function systemFromSlug(slug: string): string | undefined {
  return (
    listSystemsInUse().find((s) => systemSlug(s.system) === slug)?.system ??
    SYSTEMS.find((s) => s !== "Other" && systemSlug(s) === slug)
  );
}

/** Known systems with no published game right now (for "more systems" links). */
export function idleKnownSystems(): string[] {
  const inUse = new Set(listSystemsInUse().map((s) => s.system));
  return SYSTEMS.filter((s) => s !== "Other" && !inUse.has(s));
}

export function listSystemsInUse(): { system: string; n: number }[] {
  return db()
    .prepare("SELECT system, COUNT(*) AS n FROM games WHERE status = 'published' GROUP BY system ORDER BY n DESC, system")
    .all() as { system: string; n: number }[];
}

export type GameDetail = GameCard & {
  description: string;
  platform: string;
  min_age: number;
  content_warnings: string;
  safety_tools: string;
  status: "draft" | "published" | "archived";
  gm_headline: string;
  gm_bio: string;
  gm_payment_info: string;
};

/** Includes the GM's payment details — only render them to members (see isGameMember). */
export function getGameBySlug(slug: string): GameDetail | undefined {
  return db()
    .prepare(
      `SELECT c.*, g.description, g.platform, g.min_age, g.content_warnings, g.safety_tools, g.status,
              COALESCE(p.headline, '') AS gm_headline, u.bio AS gm_bio, COALESCE(p.payment_info, '') AS gm_payment_info
         FROM (${CARD_SELECT} WHERE g.slug = ?) c
         JOIN games g ON g.id = c.id
         JOIN users u ON u.id = g.gm_id
         LEFT JOIN gm_profiles p ON p.user_id = u.id`,
    )
    .get(new Date().toISOString(), slug) as GameDetail | undefined;
}

export type GameRow = {
  id: number; gm_id: number; slug: string; title: string; system: string; summary: string; description: string;
  format: "one_shot" | "campaign"; location_type: "online" | "in_person"; language: GameLanguage; platform: string; city: string;
  price_idr: number; seats_total: number; experience_level: "any" | "beginner" | "experienced"; min_age: number;
  content_warnings: string; safety_tools: string; tags: string; cover_hue: number; cover_image: string; genres: string; styles: string;
  status: "draft" | "published" | "archived"; created_at: string;
};

export function getGameById(id: number): GameRow | undefined {
  return db().prepare("SELECT * FROM games WHERE id = ?").get(id) as GameRow | undefined;
}

export type SessionRow = {
  id: number;
  game_id: number;
  starts_at: string;
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled";
  seats_taken: number;
  seats_held: number;
};

export function listSessions(gameId: number, opts: { upcomingOnly?: boolean } = {}): SessionRow[] {
  const cond = opts.upcomingOnly ? "AND s.status = 'scheduled' AND s.starts_at > ?" : "";
  const args: (string | number)[] = [gameId];
  if (opts.upcomingOnly) args.push(new Date().toISOString());
  return db()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') AS seats_taken,
              (SELECT COUNT(*) FROM waitlist w WHERE w.session_id = s.id AND w.status = 'offered' AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS seats_held
         FROM game_sessions s WHERE s.game_id = ? ${cond} ORDER BY s.starts_at`,
    )
    .all(...args) as SessionRow[];
}

export function getSessionWithGame(sessionId: number) {
  return db()
    .prepare(
      `SELECT s.id, s.starts_at, s.duration_minutes, s.status, s.reschedule_count,
              (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') AS seats_taken,
              g.id AS game_id, g.slug, g.title, g.system, g.price_idr, g.seats_total, g.status AS game_status,
              g.gm_id, g.cover_hue, g.cover_image, u.name AS gm_name, u.avatar_image AS gm_image,
              g.summary, g.location_type, g.platform, g.city
         FROM game_sessions s JOIN games g ON g.id = s.game_id JOIN users u ON u.id = g.gm_id
        WHERE s.id = ?`,
    )
    .get(sessionId) as
    | {
        id: number; starts_at: string; duration_minutes: number; status: string; seats_taken: number;
        game_id: number; slug: string; title: string; system: string; price_idr: number; seats_total: number;
        game_status: string; gm_id: number; cover_hue: number; cover_image: string; gm_name: string; gm_image: string;
        summary: string; location_type: "online" | "in_person"; platform: string; city: string;
      }
    | undefined;
}

export type ReviewRow = {
  id: number; rating: number; body: string; created_at: string; player_name: string; player_hue: number; player_image?: string;
  player_id?: number; game_title?: string; game_slug?: string;
};

export function listGameReviews(gameId: number): ReviewRow[] {
  return db()
    .prepare(
      `SELECT r.id, r.player_id, r.rating, r.body, r.created_at, u.name AS player_name, u.avatar_hue AS player_hue, u.avatar_image AS player_image
         FROM reviews r JOIN users u ON u.id = r.player_id WHERE r.game_id = ? ORDER BY r.created_at DESC`,
    )
    .all(gameId) as ReviewRow[];
}

export function getGmProfile(userId: number) {
  return db()
    .prepare(
      `SELECT u.id, u.name, u.bio, u.avatar_hue, u.avatar_image, u.created_at, p.headline, p.systems, p.years_experience, p.location, p.verified,
              (SELECT ROUND(AVG(r.rating),1) FROM reviews r JOIN games g ON g.id = r.game_id WHERE g.gm_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r JOIN games g ON g.id = r.game_id WHERE g.gm_id = u.id) AS review_count,
              (SELECT COUNT(*) FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id
                WHERE g.gm_id = u.id AND s.status = 'completed' AND b.status = 'confirmed') AS seats_played
         FROM users u JOIN gm_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.deleted_at IS NULL AND u.suspended_at IS NULL`,
    )
    .get(userId) as
    | {
        id: number; name: string; bio: string; avatar_hue: number; avatar_image: string; created_at: string; headline: string; systems: string;
        years_experience: number; location: string; verified: number; avg_rating: number | null; review_count: number; seats_played: number;
      }
    | undefined;
}

export function listGmGames(gmId: number, includeUnpublished = false, limit = -1): (GameCard & { status: string })[] {
  const cond = includeUnpublished ? "g.status != 'archived'" : "g.status = 'published'";
  return db()
    .prepare(`SELECT c.*, g.status FROM (${CARD_SELECT} WHERE g.gm_id = ? AND ${cond}) c JOIN games g ON g.id = c.id ORDER BY g.created_at DESC, g.id DESC LIMIT ?`)
    .all(new Date().toISOString(), gmId, limit) as (GameCard & { status: string })[];
}

export function listGmReviews(gmId: number, limit = 10): ReviewRow[] {
  return db()
    .prepare(
      `SELECT r.id, r.rating, r.body, r.created_at, u.name AS player_name, u.avatar_hue AS player_hue, g.title AS game_title, g.slug AS game_slug
         FROM reviews r JOIN users u ON u.id = r.player_id JOIN games g ON g.id = r.game_id
        WHERE g.gm_id = ? ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(gmId, limit) as ReviewRow[];
}

export type PlayerBooking = {
  booking_id: number;
  paid_marked_at: string | null;
  status: "confirmed" | "cancelled";
  cancelled_by: "player" | "gm" | null;
  price_idr: number;
  session_id: number;
  starts_at: string;
  duration_minutes: number;
  session_status: string;
  cancel_reason: string;
  game_id: number;
  slug: string;
  title: string;
  system: string;
  cover_hue: number;
  cover_image: string;
  platform: string;
  location_type: string;
  city: string;
  gm_name: string;
  has_review: number;
};

export function listPlayerBookings(playerId: number): PlayerBooking[] {
  return db()
    .prepare(
      `SELECT b.id AS booking_id, b.status, b.cancelled_by, b.price_idr, b.paid_marked_at, s.id AS session_id, s.starts_at, s.duration_minutes, s.status AS session_status, s.cancel_reason,
              g.id AS game_id, g.slug, g.title, g.system, g.cover_hue, g.cover_image, g.platform, g.location_type, g.city, u.name AS gm_name,
              EXISTS (SELECT 1 FROM reviews r WHERE r.game_id = g.id AND r.player_id = b.player_id) AS has_review
         FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id JOIN users u ON u.id = g.gm_id
        WHERE b.player_id = ? ORDER BY s.starts_at`,
    )
    .all(playerId) as PlayerBooking[];
}

export function isGameMember(gameId: number, userId: number): boolean {
  const row = db()
    .prepare(
      `SELECT 1 FROM games g WHERE g.id = ? AND g.gm_id = ?
       UNION SELECT 1 FROM bookings b JOIN game_sessions s ON s.id = b.session_id
        WHERE s.game_id = ? AND b.player_id = ? AND b.status = 'confirmed' LIMIT 1`,
    )
    .get(gameId, userId, gameId, userId);
  return !!row;
}

export function playerBookedSessionIds(gameId: number, userId: number): number[] {
  return (
    db()
      .prepare(
        `SELECT b.session_id FROM bookings b JOIN game_sessions s ON s.id = b.session_id
          WHERE s.game_id = ? AND b.player_id = ? AND b.status = 'confirmed'`,
      )
      .all(gameId, userId) as { session_id: number }[]
  ).map((r) => r.session_id);
}

/** A player may review a game once they held a seat in a session that has started. */
export function canReview(gameId: number, userId: number): boolean {
  const row = db()
    .prepare(
      `SELECT 1 FROM bookings b JOIN game_sessions s ON s.id = b.session_id
        WHERE s.game_id = ? AND b.player_id = ? AND b.status = 'confirmed'
          AND (s.status = 'completed' OR s.starts_at <= ?)
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.game_id = s.game_id AND r.player_id = b.player_id)
        LIMIT 1`,
    )
    .get(gameId, userId, new Date().toISOString());
  return !!row;
}

export type MessageRow = { id: number; body: string; created_at: string; user_id: number; name: string; avatar_hue: number; avatar_image: string; is_gm: number };

/** The newest 200 messages, returned oldest-first for display. */
export function listMessages(gameId: number, limit = 200): MessageRow[] {
  const newest = db()
    .prepare(
      `SELECT m.id, m.body, m.created_at, u.id AS user_id, u.name, u.avatar_hue, u.avatar_image, (g.gm_id = u.id) AS is_gm
         FROM messages m JOIN users u ON u.id = m.user_id JOIN games g ON g.id = m.game_id
        WHERE m.game_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    )
    .all(gameId, limit) as MessageRow[];
  return newest.reverse();
}

/** Most seats already taken in any upcoming scheduled session of a game (0 if none). */
export function maxSeatsTakenUpcoming(gameId: number): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(MAX(n), 0) AS n FROM (
         SELECT COUNT(b.id) AS n FROM game_sessions s
           LEFT JOIN bookings b ON b.session_id = s.id AND b.status = 'confirmed'
          WHERE s.game_id = ? AND s.status = 'scheduled' AND s.starts_at > ?
          GROUP BY s.id)`,
    )
    .get(gameId, new Date().toISOString()) as { n: number };
  return row.n;
}

/** Total seats held by players in a game's upcoming sessions (for the archive warning). */
export function upcomingSeatsTaken(gameId: number): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings b JOIN game_sessions s ON s.id = b.session_id
        WHERE s.game_id = ? AND s.status = 'scheduled' AND s.starts_at > ? AND b.status = 'confirmed'`,
    )
    .get(gameId, new Date().toISOString()) as { n: number };
  return row.n;
}

/** GM KPIs. Income figures are estimates: players pay the GM directly, 100% to the GM. */
export function gmDashboardStats(gmId: number) {
  const now = new Date().toISOString();
  return db()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM games WHERE gm_id = ? AND status = 'published') AS live_games,
         (SELECT COUNT(*) FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE g.gm_id = ? AND s.status = 'scheduled' AND s.starts_at > ?) AS upcoming_sessions,
         (SELECT COUNT(*) FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id
            WHERE g.gm_id = ? AND b.status = 'confirmed' AND s.status = 'scheduled' AND s.starts_at > ?) AS upcoming_players,
         (SELECT COALESCE(SUM(b.price_idr), 0) FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id
            WHERE g.gm_id = ? AND b.status = 'confirmed' AND s.status = 'scheduled' AND s.starts_at > ?) AS expected_income_idr`,
    )
    .get(gmId, gmId, now, gmId, now, gmId, now) as {
    live_games: number; upcoming_sessions: number; upcoming_players: number; expected_income_idr: number;
  };
}

export function listSessionRoster(sessionId: number) {
  return db()
    .prepare(
      `SELECT b.id AS booking_id, b.status, b.paid_marked_at, u.id AS user_id, u.name, u.avatar_hue, u.avatar_image
         FROM bookings b JOIN users u ON u.id = b.player_id WHERE b.session_id = ? ORDER BY b.created_at`,
    )
    .all(sessionId) as { booking_id: number; status: string; paid_marked_at: string | null; user_id: number; name: string; avatar_hue: number; avatar_image: string }[];
}

export function getGmSettings(userId: number) {
  return db()
    .prepare(
      "SELECT p.headline, p.systems, p.years_experience, p.location, p.payment_info, u.bio, u.name, u.avatar_hue, u.avatar_image FROM users u LEFT JOIN gm_profiles p ON p.user_id = u.id WHERE u.id = ?",
    )
    .get(userId) as
    | { headline: string | null; systems: string | null; years_experience: number | null; location: string | null; payment_info: string | null; bio: string; name: string; avatar_hue: number; avatar_image: string }
    | undefined;
}

// ─── Hire a GM: directory ───────────────────────────────────────────────

export type GmDirectoryRow = {
  id: number; name: string; avatar_hue: number; avatar_image: string; headline: string; systems: string;
  location: string; verified: number; years_experience: number; avg_rating: number | null; review_count: number;
  sessions_hosted: number; live_games: number; min_price: number | null; genres: string; styles: string; languages: string;
};

export type GmFilters = { q?: string; system?: string; genre?: string; style?: string; mechanic?: string; where?: string; language?: string; verified?: boolean };

/** GMs with a filled-in profile, filtered for the "Hire a GM" directory. */
export function searchGms(f: GmFilters, limit = 48): GmDirectoryRow[] {
  const where = ["u.role IN ('gm','admin')", "p.headline <> ''", "u.deleted_at IS NULL", "u.suspended_at IS NULL"];
  const args: (string | number)[] = [];
  const like = (v: string) => `%${escapeLike(v)}%`;
  if (f.q) { where.push("(u.name LIKE ? ESCAPE '\\' OR p.headline LIKE ? ESCAPE '\\')"); args.push(like(f.q), like(f.q)); }
  if (f.system) {
    where.push("(p.systems LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND g.system = ?))");
    args.push(like(f.system), f.system);
  }
  if (f.mechanic && isMechanic(f.mechanic)) {
    const systems = getMechanic(f.mechanic).systems;
    where.push(`EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND g.system IN (${systems.map(() => "?").join(",")}))`);
    args.push(...systems);
  }
  if (f.genre && isGenre(f.genre)) {
    where.push("EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND (',' || g.genres || ',') LIKE ?)");
    args.push(`%,${f.genre},%`);
  }
  if (f.style && isStyle(f.style)) {
    where.push("EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND (',' || g.styles || ',') LIKE ?)");
    args.push(`%,${f.style},%`);
  }
  if (f.where === "online") {
    where.push("(p.location = 'Online' OR EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND g.location_type = 'online'))");
  } else if (f.where) {
    where.push("(p.location LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND g.city LIKE ? ESCAPE '\\'))");
    args.push(like(f.where), like(f.where));
  }
  if (f.language === "id" || f.language === "en") {
    where.push("EXISTS (SELECT 1 FROM games g WHERE g.gm_id = u.id AND g.status = 'published' AND g.language IN (?, 'both'))");
    args.push(f.language);
  }
  if (f.verified) where.push("p.verified = 1");
  args.push(limit);
  return db()
    .prepare(
      `SELECT u.id, u.name, u.avatar_hue, u.avatar_image, p.headline, p.systems, p.location, p.verified, p.years_experience,
              (SELECT ROUND(AVG(r.rating), 1) FROM reviews r JOIN games g ON g.id = r.game_id WHERE g.gm_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r JOIN games g ON g.id = r.game_id WHERE g.gm_id = u.id) AS review_count,
              (SELECT COUNT(*) FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE g.gm_id = u.id AND s.status = 'completed') AS sessions_hosted,
              (SELECT COUNT(*) FROM games g WHERE g.gm_id = u.id AND g.status = 'published') AS live_games,
              (SELECT MIN(g.price_idr) FROM games g WHERE g.gm_id = u.id AND g.status = 'published') AS min_price,
              COALESCE((SELECT GROUP_CONCAT(g.genres) FROM games g WHERE g.gm_id = u.id AND g.status = 'published'), '') AS genres,
              COALESCE((SELECT GROUP_CONCAT(g.styles) FROM games g WHERE g.gm_id = u.id AND g.status = 'published'), '') AS styles,
              COALESCE((SELECT GROUP_CONCAT(DISTINCT g.language) FROM games g WHERE g.gm_id = u.id AND g.status = 'published'), '') AS languages
         FROM users u JOIN gm_profiles p ON p.user_id = u.id
        WHERE ${where.join(" AND ")}
        ORDER BY p.verified DESC, avg_rating IS NULL, avg_rating DESC, sessions_hosted DESC, u.name
        LIMIT ?`,
    )
    .all(...args) as GmDirectoryRow[];
}

// ─── Hire a GM: requests, offers, thread ────────────────────────────────

export type GmRequestRow = {
  id: number; requester_id: number; requester_name: string; requester_hue: number; requester_image: string;
  gm_id: number | null; target_gm_name: string | null; title: string; system: string; group_size: number;
  experience_level: "any" | "beginner" | "experienced"; language: "id" | "en" | "both"; location_type: "online" | "in_person";
  city: string; schedule: string; budget_idr: number; details: string; status: "open" | "matched" | "closed";
  matched_gm_id: number | null; created_at: string; offer_count: number;
};

const REQUEST_SELECT = `
  SELECT r.*, u.name AS requester_name, u.avatar_hue AS requester_hue, u.avatar_image AS requester_image,
         t.name AS target_gm_name,
         (SELECT COUNT(*) FROM gm_request_offers o WHERE o.request_id = r.id) AS offer_count
    FROM gm_requests r JOIN users u ON u.id = r.requester_id LEFT JOIN users t ON t.id = r.gm_id`;

export function getGmRequest(id: number): GmRequestRow | undefined {
  return db().prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id) as GmRequestRow | undefined;
}

export function listMyGmRequests(userId: number): GmRequestRow[] {
  return db().prepare(`${REQUEST_SELECT} WHERE r.requester_id = ? ORDER BY r.created_at DESC`).all(userId) as GmRequestRow[];
}

/** Open requests a GM may answer: public ones plus those sent to them directly (direct first). */
export function listOpenRequestsForGm(gmId: number): (GmRequestRow & { my_offer: number })[] {
  return db()
    .prepare(
      `SELECT q.*, EXISTS (SELECT 1 FROM gm_request_offers o WHERE o.request_id = q.id AND o.gm_id = ?) AS my_offer
         FROM (${REQUEST_SELECT} WHERE r.status = 'open' AND r.requester_id <> ? AND (r.gm_id IS NULL OR r.gm_id = ?)) q
        ORDER BY (q.gm_id IS NULL), q.created_at DESC`,
    )
    .all(gmId, gmId, gmId) as (GmRequestRow & { my_offer: number })[];
}

export function listMatchedRequestsForGm(gmId: number): GmRequestRow[] {
  return db().prepare(`${REQUEST_SELECT} WHERE r.status = 'matched' AND r.matched_gm_id = ? ORDER BY r.created_at DESC`).all(gmId) as GmRequestRow[];
}

export function countOpenRequestsForGm(gmId: number): number {
  return (
    db()
      .prepare(
        `SELECT COUNT(*) AS n FROM gm_requests r WHERE r.status = 'open' AND r.requester_id <> ? AND (r.gm_id IS NULL OR r.gm_id = ?)
           AND NOT EXISTS (SELECT 1 FROM gm_request_offers o WHERE o.request_id = r.id AND o.gm_id = ?)`,
      )
      .get(gmId, gmId, gmId) as { n: number }
  ).n;
}

export type OfferRow = {
  id: number; request_id: number; gm_id: number; message: string; price_idr: number; created_at: string;
  gm_name: string; gm_hue: number; gm_image: string; gm_headline: string; gm_verified: number; avg_rating: number | null; review_count: number;
};

export function listOffers(requestId: number): OfferRow[] {
  return db()
    .prepare(
      `SELECT o.*, u.name AS gm_name, u.avatar_hue AS gm_hue, u.avatar_image AS gm_image,
              COALESCE(p.headline, '') AS gm_headline, COALESCE(p.verified, 0) AS gm_verified,
              (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv JOIN games g ON g.id = rv.game_id WHERE g.gm_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews rv JOIN games g ON g.id = rv.game_id WHERE g.gm_id = u.id) AS review_count
         FROM gm_request_offers o JOIN users u ON u.id = o.gm_id LEFT JOIN gm_profiles p ON p.user_id = u.id
        WHERE o.request_id = ? ORDER BY o.created_at`,
    )
    .all(requestId) as OfferRow[];
}

export function getOffer(requestId: number, gmId: number): OfferRow | undefined {
  return listOffers(requestId).find((o) => o.gm_id === gmId);
}

export type RequestMessageRow = { id: number; body: string; created_at: string; user_id: number; name: string; avatar_hue: number; avatar_image: string };

export function listRequestMessages(requestId: number): RequestMessageRow[] {
  return (
    db()
      .prepare(
        `SELECT m.id, m.body, m.created_at, u.id AS user_id, u.name, u.avatar_hue, u.avatar_image
           FROM gm_request_messages m JOIN users u ON u.id = m.user_id
          WHERE m.request_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 200`,
      )
      .all(requestId) as RequestMessageRow[]
  ).reverse();
}

export function getPaymentInfo(gmId: number): string {
  const row = db().prepare("SELECT payment_info FROM gm_profiles WHERE user_id = ?").get(gmId) as { payment_info: string } | undefined;
  return row?.payment_info ?? "";
}

export function getUserSettings(userId: number) {
  return db()
    .prepare("SELECT id, name, email, bio, role, avatar_hue, avatar_image, email_reminders, email_notifications, calendar_token FROM users WHERE id = ?")
    .get(userId) as { id: number; name: string; email: string; bio: string; role: string; avatar_hue: number; avatar_image: string; email_reminders: number; email_notifications: number; calendar_token: string | null } | undefined;
}

/** Public, indexable URLs' data for sitemap.xml: published games and listed GMs. */
export function sitemapEntries(): { games: { slug: string; created_at: string }[]; gms: { id: number }[] } {
  const games = db().prepare("SELECT slug, created_at FROM games WHERE status = 'published' ORDER BY id").all() as { slug: string; created_at: string }[];
  const gms = db()
    .prepare(
      `SELECT u.id FROM users u JOIN gm_profiles p ON p.user_id = u.id
        WHERE u.role IN ('gm','admin') AND p.headline <> '' AND u.deleted_at IS NULL AND u.suspended_at IS NULL ORDER BY u.id`,
    )
    .all() as { id: number }[];
  return { games, gms };
}

export type FeedSession = {
  id: number; starts_at: string; duration_minutes: number; status: string; reschedule_count: number;
  title: string; system: string; slug: string; location_type: string; platform: string; city: string;
};

/** Whose calendar feed a token opens (active accounts only). */
export function calendarFeedOwner(token: string): { id: number; locale: "en" | "id"; name: string } | undefined {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return undefined;
  return db()
    .prepare("SELECT id, locale, name FROM users WHERE calendar_token = ? AND deleted_at IS NULL AND suspended_at IS NULL")
    .get(token) as { id: number; locale: "en" | "id"; name: string } | undefined;
}

/**
 * Sessions for someone's calendar feed, from 60 days ago onwards: seats they booked (sessions the
 * GM cancelled stay, marked cancelled) and, for GMs, every session of their own games.
 */
export function calendarFeedSessions(userId: number, now = new Date()): FeedSession[] {
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const cols = "s.id, s.starts_at, s.duration_minutes, s.status, s.reschedule_count, g.title, g.system, g.slug, g.location_type, g.platform, g.city";
  const rows = db()
    .prepare(
      `SELECT ${cols} FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id
        WHERE b.player_id = ? AND s.starts_at > ? AND (b.status = 'confirmed' OR (b.cancelled_by = 'gm' AND s.status = 'cancelled'))
       UNION
       SELECT ${cols} FROM game_sessions s JOIN games g ON g.id = s.game_id
        WHERE g.gm_id = ? AND s.starts_at > ?
       ORDER BY starts_at`,
    )
    .all(userId, since, userId, since) as FeedSession[];
  return rows;
}

/** Every confirmed seat in my (not cancelled) sessions, for the earnings page and CSV. */
export function gmEarningRows(gmId: number): import("./earnings").EarningRow[] {
  return db()
    .prepare(
      `SELECT b.id AS booking_id, b.price_idr, (b.paid_marked_at IS NOT NULL) AS paid, s.id AS session_id, s.starts_at,
              g.id AS game_id, g.title, u.name AS player_name
         FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id JOIN users u ON u.id = b.player_id
        WHERE g.gm_id = ? AND b.status = 'confirmed' AND s.status <> 'cancelled'
        ORDER BY s.starts_at, b.id`,
    )
    .all(gmId) as import("./earnings").EarningRow[];
}

/** Steps a new GM needs before their first booking (the GM dashboard checklist). */
export function gmOnboarding(gmId: number) {
  const s = getGmSettings(gmId);
  const n = (sql: string) => (db().prepare(sql).get(gmId) as { n: number }).n;
  const firstGame = db().prepare("SELECT id, slug FROM games WHERE gm_id = ? AND status <> 'archived' ORDER BY id LIMIT 1").get(gmId) as { id: number; slug: string } | undefined;
  return {
    profile: !!s?.headline && (s?.bio ?? "").length >= 30,
    payment: !!s?.payment_info,
    published: n("SELECT COUNT(*) AS n FROM games WHERE gm_id = ? AND status = 'published'") > 0,
    session: n("SELECT COUNT(*) AS n FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE g.gm_id = ?") > 0,
    booking: n("SELECT COUNT(*) AS n FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id WHERE g.gm_id = ?") > 0,
    firstGame,
  };
}
