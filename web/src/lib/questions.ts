import "server-only";
import { db, tx } from "./db";
import { notify } from "./notifications";

// Pre-booking questions: one private thread per (game, player) between the player and the GM.

export type QuestionThread = {
  id: number; game_id: number; player_id: number; gm_id: number;
  game_title: string; game_slug: string; game_status: string;
  player_name: string; player_hue: number; player_image: string;
  gm_name: string; gm_hue: number; gm_image: string;
};

export function getQuestionThread(id: number): QuestionThread | undefined {
  return db()
    .prepare(
      `SELECT q.id, q.game_id, q.player_id, g.gm_id, g.title AS game_title, g.slug AS game_slug, g.status AS game_status,
              p.name AS player_name, p.avatar_hue AS player_hue, p.avatar_image AS player_image,
              m.name AS gm_name, m.avatar_hue AS gm_hue, m.avatar_image AS gm_image
         FROM game_questions q JOIN games g ON g.id = q.game_id JOIN users p ON p.id = q.player_id JOIN users m ON m.id = g.gm_id
        WHERE q.id = ?`,
    )
    .get(id) as QuestionThread | undefined;
}

export function findQuestion(gameId: number, playerId: number): number | undefined {
  return (db().prepare("SELECT id FROM game_questions WHERE game_id = ? AND player_id = ?").get(gameId, playerId) as { id: number } | undefined)?.id;
}

/** A player's message: opens the thread on first use. The GM is notified. Returns the thread id. */
export function askQuestion(gameId: number, gmId: number, playerId: number, body: string): number {
  return tx((c) => {
    const now = new Date().toISOString();
    c.prepare("INSERT INTO game_questions (game_id, player_id) VALUES (?, ?) ON CONFLICT(game_id, player_id) DO NOTHING").run(gameId, playerId);
    const id = (c.prepare("SELECT id FROM game_questions WHERE game_id = ? AND player_id = ?").get(gameId, playerId) as { id: number }).id;
    c.prepare("INSERT INTO game_question_messages (question_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(id, playerId, body, now);
    c.prepare("UPDATE game_questions SET last_message_at = ? WHERE id = ?").run(now, id);
    notify({ userId: gmId, kind: "game_question", actorId: playerId, questionId: id }, c);
    return id;
  });
}

/** A reply in an existing thread (either side); the other side is notified. */
export function replyQuestion(t: QuestionThread, userId: number, body: string): void {
  tx((c) => {
    const now = new Date().toISOString();
    c.prepare("INSERT INTO game_question_messages (question_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(t.id, userId, body, now);
    c.prepare("UPDATE game_questions SET last_message_at = ? WHERE id = ?").run(now, t.id);
    notify({ userId: userId === t.player_id ? t.gm_id : t.player_id, kind: "game_question", actorId: userId, questionId: t.id }, c);
  });
}

export type QuestionMessage = { id: number; user_id: number; body: string; created_at: string; name: string; avatar_hue: number; avatar_image: string };

export function listQuestionMessages(questionId: number): QuestionMessage[] {
  return db()
    .prepare(
      `SELECT m.id, m.user_id, m.body, m.created_at, u.name, u.avatar_hue, u.avatar_image
         FROM game_question_messages m JOIN users u ON u.id = m.user_id WHERE m.question_id = ? ORDER BY m.created_at, m.id`,
    )
    .all(questionId) as QuestionMessage[];
}

export type QuestionSummary = {
  id: number; game_title: string; game_slug: string; other_name: string; other_hue: number; other_image: string;
  last_body: string; last_at: string; awaiting: number;
};

const LAST = `(SELECT body FROM game_question_messages x WHERE x.question_id = q.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1)`;
const LAST_BY = `(SELECT user_id FROM game_question_messages x WHERE x.question_id = q.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1)`;

/** Threads about my games, newest first; `awaiting` = the player spoke last. */
export function listGmQuestions(gmId: number): QuestionSummary[] {
  return db()
    .prepare(
      `SELECT q.id, g.title AS game_title, g.slug AS game_slug, p.name AS other_name, p.avatar_hue AS other_hue, p.avatar_image AS other_image,
              ${LAST} AS last_body, q.last_message_at AS last_at, (${LAST_BY} = q.player_id) AS awaiting
         FROM game_questions q JOIN games g ON g.id = q.game_id JOIN users p ON p.id = q.player_id
        WHERE g.gm_id = ? AND p.suspended_at IS NULL ORDER BY q.last_message_at DESC LIMIT 100`,
    )
    .all(gmId) as QuestionSummary[];
}

/** My questions to GMs; `awaiting` = the GM replied last (my turn to read). */
export function listPlayerQuestions(playerId: number): QuestionSummary[] {
  return db()
    .prepare(
      `SELECT q.id, g.title AS game_title, g.slug AS game_slug, m.name AS other_name, m.avatar_hue AS other_hue, m.avatar_image AS other_image,
              ${LAST} AS last_body, q.last_message_at AS last_at, (${LAST_BY} = g.gm_id) AS awaiting
         FROM game_questions q JOIN games g ON g.id = q.game_id JOIN users m ON m.id = g.gm_id
        WHERE q.player_id = ? ORDER BY q.last_message_at DESC LIMIT 50`,
    )
    .all(playerId) as QuestionSummary[];
}

export function countAwaitingForGm(gmId: number): number {
  return listGmQuestions(gmId).filter((q) => q.awaiting).length;
}
