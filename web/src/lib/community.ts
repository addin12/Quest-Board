import "server-only";
import { db, tx } from "./db";
import { escapeLike } from "./policy";
import { notify } from "./notifications";
import { NOTICE_DAYS, type NoticeInput, type NoticeKind } from "./board";

// Tavern Notice Board, saved games and GM follows.

export type NoticeRow = {
  id: number; author_id: number; kind: NoticeKind; title: string; system: string; location_type: "online" | "in_person"; city: string;
  language: "id" | "en" | "both"; schedule: string; spots: number; body: string; status: "open" | "closed"; created_at: string; expires_at: string;
  author_name: string; author_hue: number; author_image: string; reply_count: number;
};

const NOTICE_SELECT = `
  SELECT p.*, u.name AS author_name, u.avatar_hue AS author_hue, u.avatar_image AS author_image,
         (SELECT COUNT(*) FROM lfg_replies r WHERE r.post_id = p.id) AS reply_count
    FROM lfg_posts p JOIN users u ON u.id = p.author_id`;

export type NoticeFilters = { kind?: NoticeKind; q?: string; where?: string; language?: "id" | "en" };

export function listNotices(f: NoticeFilters = {}, limit = 60): NoticeRow[] {
  const where = ["p.status = 'open'", "p.expires_at > ?", "u.deleted_at IS NULL", "u.suspended_at IS NULL"];
  const args: (string | number)[] = [new Date().toISOString()];
  if (f.kind) { where.push("p.kind = ?"); args.push(f.kind); }
  if (f.q) {
    where.push("(p.title LIKE ? ESCAPE '\\' OR p.system LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')");
    const l = `%${escapeLike(f.q)}%`;
    args.push(l, l, l);
  }
  if (f.where === "online") where.push("p.location_type = 'online'");
  else if (f.where) { where.push("p.location_type = 'in_person' AND p.city LIKE ? ESCAPE '\\'"); args.push(`%${escapeLike(f.where)}%`); }
  if (f.language) { where.push("p.language IN (?, 'both')"); args.push(f.language); }
  args.push(limit);
  return db().prepare(`${NOTICE_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC LIMIT ?`).all(...args) as NoticeRow[];
}

export function getNotice(id: number): NoticeRow | undefined {
  return db().prepare(`${NOTICE_SELECT} WHERE p.id = ?`).get(id) as NoticeRow | undefined;
}

export function myNotices(userId: number): NoticeRow[] {
  return db().prepare(`${NOTICE_SELECT} WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 20`).all(userId) as NoticeRow[];
}

export function createNotice(authorId: number, n: NoticeInput): number {
  const expires = new Date(Date.now() + NOTICE_DAYS * 86_400_000).toISOString();
  return Number(
    db()
      .prepare(
        `INSERT INTO lfg_posts (author_id, kind, title, system, location_type, city, language, schedule, spots, body, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(authorId, n.kind, n.title, n.system, n.locationType, n.city, n.language, n.schedule, n.spots, n.body, expires).lastInsertRowid,
  );
}

export function updateNotice(id: number, n: NoticeInput): void {
  db()
    .prepare("UPDATE lfg_posts SET kind = ?, title = ?, system = ?, location_type = ?, city = ?, language = ?, schedule = ?, spots = ?, body = ? WHERE id = ?")
    .run(n.kind, n.title, n.system, n.locationType, n.city, n.language, n.schedule, n.spots, n.body, id);
}

/** "Keep it up": another NOTICE_DAYS on the board from now (and a fresh reminder next time). */
export function renewNotice(id: number, now = new Date()): void {
  db().prepare("UPDATE lfg_posts SET expires_at = ?, expiry_notified_at = NULL WHERE id = ?").run(new Date(now.getTime() + NOTICE_DAYS * 86_400_000).toISOString(), id);
}

/** Days before a notice comes down that its author is reminded (once). */
export const NOTICE_REMIND_DAYS = 3;

/** Tell authors their notice comes down soon, so they can keep it up. Returns how many were told. */
export function remindExpiringNotices(now = new Date()): number {
  const soon = new Date(now.getTime() + NOTICE_REMIND_DAYS * 86_400_000).toISOString();
  return tx((c) => {
    const due = c
      .prepare(
        `SELECT p.id, p.author_id FROM lfg_posts p JOIN users u ON u.id = p.author_id
          WHERE p.status = 'open' AND p.expiry_notified_at IS NULL AND p.expires_at > ? AND p.expires_at <= ?
            AND u.deleted_at IS NULL AND u.suspended_at IS NULL`,
      )
      .all(now.toISOString(), soon) as { id: number; author_id: number }[];
    const mark = c.prepare("UPDATE lfg_posts SET expiry_notified_at = ? WHERE id = ?");
    for (const d of due) {
      notify({ userId: d.author_id, kind: "notice_expiring", postId: d.id }, c);
      mark.run(now.toISOString(), d.id);
    }
    return due.length;
  });
}

export type ReplyRow = { id: number; author_id: number; body: string; created_at: string; name: string; avatar_hue: number; avatar_image: string };

export function listReplies(postId: number): ReplyRow[] {
  return db()
    .prepare(
      `SELECT r.id, r.author_id, r.body, r.created_at, u.name, u.avatar_hue, u.avatar_image
         FROM lfg_replies r JOIN users u ON u.id = r.author_id WHERE r.post_id = ? ORDER BY r.created_at, r.id LIMIT 300`,
    )
    .all(postId) as ReplyRow[];
}

export function addReply(postId: number, authorId: number, body: string): void {
  tx((c) => {
    c.prepare("INSERT INTO lfg_replies (post_id, author_id, body) VALUES (?, ?, ?)").run(postId, authorId, body);
    const post = c.prepare("SELECT author_id FROM lfg_posts WHERE id = ?").get(postId) as { author_id: number };
    notify({ userId: post.author_id, kind: "lfg_reply", actorId: authorId, postId }, c);
    // Others who replied earlier (e.g. the author answering a player) — so conversations don't stall.
    const others = c.prepare("SELECT DISTINCT author_id FROM lfg_replies WHERE post_id = ? AND author_id NOT IN (?, ?)").all(postId, authorId, post.author_id) as { author_id: number }[];
    for (const o of others) notify({ userId: o.author_id, kind: "lfg_thread_reply", actorId: authorId, postId }, c);
  });
}

// ── Saved games ──

export function isSaved(userId: number, gameId: number): boolean {
  return !!db().prepare("SELECT 1 FROM saved_games WHERE user_id = ? AND game_id = ?").get(userId, gameId);
}

export function setSaved(userId: number, gameId: number, saved: boolean): void {
  if (saved) db().prepare("INSERT OR IGNORE INTO saved_games (user_id, game_id) VALUES (?, ?)").run(userId, gameId);
  else db().prepare("DELETE FROM saved_games WHERE user_id = ? AND game_id = ?").run(userId, gameId);
}

export function listSavedGameIds(userId: number): number[] {
  return (db().prepare("SELECT game_id FROM saved_games WHERE user_id = ? ORDER BY created_at DESC").all(userId) as { game_id: number }[]).map((r) => r.game_id);
}

// ── Following GMs ──

export function isFollowing(followerId: number, gmId: number): boolean {
  return !!db().prepare("SELECT 1 FROM gm_follows WHERE follower_id = ? AND gm_id = ?").get(followerId, gmId);
}

export function setFollowing(followerId: number, gmId: number, follow: boolean): void {
  if (follow) db().prepare("INSERT OR IGNORE INTO gm_follows (follower_id, gm_id) VALUES (?, ?)").run(followerId, gmId);
  else db().prepare("DELETE FROM gm_follows WHERE follower_id = ? AND gm_id = ?").run(followerId, gmId);
}

export function followerCount(gmId: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM gm_follows f JOIN users u ON u.id = f.follower_id WHERE f.gm_id = ? AND u.deleted_at IS NULL").get(gmId) as { n: number }).n;
}

export function listFollowing(userId: number) {
  return db()
    .prepare(
      `SELECT u.id, u.name, u.avatar_hue, u.avatar_image, p.headline
         FROM gm_follows f JOIN users u ON u.id = f.gm_id JOIN gm_profiles p ON p.user_id = u.id
        WHERE f.follower_id = ? AND u.deleted_at IS NULL AND u.suspended_at IS NULL ORDER BY f.created_at DESC`,
    )
    .all(userId) as { id: number; name: string; avatar_hue: number; avatar_image: string; headline: string }[];
}

/** First time a game is published: tell the GM's followers (once per game). */
export function announceGameIfNew(gameId: number): void {
  tx((c) => {
    const g = c.prepare("SELECT id, gm_id, status, announced_at FROM games WHERE id = ?").get(gameId) as
      | { id: number; gm_id: number; status: string; announced_at: string | null } | undefined;
    if (!g || g.status !== "published" || g.announced_at) return;
    c.prepare("UPDATE games SET announced_at = ? WHERE id = ?").run(new Date().toISOString(), g.id);
    const followers = c.prepare("SELECT follower_id FROM gm_follows WHERE gm_id = ?").all(g.gm_id) as { follower_id: number }[];
    for (const f of followers) notify({ userId: f.follower_id, kind: "followed_gm_game", actorId: g.gm_id, gameId: g.id }, c);
  });
}
