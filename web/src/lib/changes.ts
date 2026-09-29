import "server-only";
import { db } from "./db";
import { isGameMember } from "./queries";

// A cheap "has anything changed?" token per live thread, so open pages poll this instead of
// re-rendering themselves every 20 seconds (components/auto-refresh.tsx, GET /api/changes).
// Tokens are counts and ids only; access follows the page's own rule. null = not yours / not found.

export type WatchKind = "chat" | "notice" | "request" | "question";
export const isWatchKind = (v: unknown): v is WatchKind => v === "chat" || v === "notice" || v === "request" || v === "question";

type Row = Record<string, string | number | null> | undefined;
const token = (r: Row) => (r ? Object.values(r).map((v) => v ?? "").join(":") : null);

export function changeVersion(kind: WatchKind, id: number, userId: number | null, isAdmin = false): string | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  switch (kind) {
    case "chat": // table chat: members only
      if (!userId || !isGameMember(id, userId)) return null;
      return token(db().prepare("SELECT COALESCE(MAX(id), 0) AS m, COUNT(*) AS n FROM messages WHERE game_id = ?").get(id) as Row);
    case "notice": // Notice Board threads are public
      return token(db().prepare(
        `SELECT p.status, p.expires_at, (SELECT COUNT(*) FROM lfg_replies r WHERE r.post_id = p.id) AS n,
                (SELECT COALESCE(MAX(r.id), 0) FROM lfg_replies r WHERE r.post_id = p.id) AS m
           FROM lfg_posts p WHERE p.id = ?`,
      ).get(id) as Row);
    case "request": // hire-a-GM threads: signed-in people (the page itself decides who sees what)
      if (!userId) return null;
      return token(db().prepare(
        `SELECT q.status, COALESCE(q.matched_gm_id, 0) AS gm, (SELECT COUNT(*) FROM gm_request_offers o WHERE o.request_id = q.id) AS offers,
                (SELECT COALESCE(MAX(m.id), 0) FROM gm_request_messages m WHERE m.request_id = q.id) AS m
           FROM gm_requests q WHERE q.id = ?`,
      ).get(id) as Row);
    case "question": { // questions to a GM: the player, the GM, admins
      if (!userId) return null;
      const q = db().prepare("SELECT gq.player_id, g.gm_id FROM game_questions gq JOIN games g ON g.id = gq.game_id WHERE gq.id = ?").get(id) as { player_id: number; gm_id: number } | undefined;
      if (!q || (q.player_id !== userId && q.gm_id !== userId && !isAdmin)) return null;
      return token(db().prepare("SELECT COALESCE(MAX(id), 0) AS m, COUNT(*) AS n FROM game_question_messages WHERE question_id = ?").get(id) as Row);
    }
  }
}
