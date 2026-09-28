import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { db, tx } from "./db";
import { archiveGame } from "./account";
import { dropFromWaitlists } from "./waitlist";
import { notify } from "./notifications";
import { isGameMember } from "./queries";
import type { ReportDecision, ReportReason, ReportTarget } from "./reports";

// Reports & moderation. A report stores a snapshot of what was reported, so the evidence
// survives if the content is later edited or removed.

type Target = { ownerId: number; snapshot: string; href: string; canSee: (userId: number) => boolean };

/** Look up a reportable thing: who owns it, what it says now, where it lives, who may see it. */
export function resolveTarget(type: ReportTarget, id: number): Target | null {
  const c = db();
  switch (type) {
    case "game": {
      const g = c.prepare("SELECT g.id, g.slug, g.title, g.summary, g.status, g.gm_id, u.name FROM games g JOIN users u ON u.id = g.gm_id WHERE g.id = ?").get(id) as
        | { slug: string; title: string; summary: string; status: string; gm_id: number; name: string } | undefined;
      if (!g || g.status !== "published") return null;
      return { ownerId: g.gm_id, href: `/games/${g.slug}`, snapshot: `Game “${g.title}” by ${g.name}\n${g.summary}`, canSee: () => true };
    }
    case "review": {
      const r = c.prepare("SELECT r.player_id, r.rating, r.body, g.slug, g.title, u.name FROM reviews r JOIN games g ON g.id = r.game_id JOIN users u ON u.id = r.player_id WHERE r.id = ?").get(id) as
        | { player_id: number; rating: number; body: string; slug: string; title: string; name: string } | undefined;
      if (!r) return null;
      return { ownerId: r.player_id, href: `/games/${r.slug}#reviews-h`, snapshot: `Review of “${r.title}” by ${r.name} (${r.rating}/5)\n${r.body}`, canSee: () => true };
    }
    case "review_reply": {
      const r = c.prepare("SELECT r.gm_reply, g.gm_id, g.slug, g.title, u.name FROM reviews r JOIN games g ON g.id = r.game_id JOIN users u ON u.id = g.gm_id WHERE r.id = ? AND r.gm_reply <> ''").get(id) as
        | { gm_reply: string; gm_id: number; slug: string; title: string; name: string } | undefined;
      if (!r) return null;
      return { ownerId: r.gm_id, href: `/games/${r.slug}#reviews-h`, snapshot: `GM reply to a review of “${r.title}”, ${r.name}:\n${r.gm_reply}`, canSee: () => true };
    }
    case "message": {
      const m = c.prepare("SELECT m.user_id, m.body, g.id AS game_id, g.slug, g.title, u.name FROM messages m JOIN games g ON g.id = m.game_id JOIN users u ON u.id = m.user_id WHERE m.id = ?").get(id) as
        | { user_id: number; body: string; game_id: number; slug: string; title: string; name: string } | undefined;
      if (!m) return null;
      return { ownerId: m.user_id, href: `/games/${m.slug}#chat-h`, snapshot: `Table chat in “${m.title}”, ${m.name}:\n${m.body}`, canSee: (u) => isGameMember(m.game_id, u) };
    }
    case "request_message": {
      const m = c.prepare(
        `SELECT m.user_id, m.body, r.id AS request_id, r.title, r.requester_id, r.matched_gm_id, u.name
           FROM gm_request_messages m JOIN gm_requests r ON r.id = m.request_id JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
      ).get(id) as { user_id: number; body: string; request_id: number; title: string; requester_id: number; matched_gm_id: number | null; name: string } | undefined;
      if (!m) return null;
      return {
        ownerId: m.user_id, href: `/hire-a-gm/requests/${m.request_id}`, snapshot: `Private chat on request “${m.title}”, ${m.name}:\n${m.body}`,
        canSee: (u) => u === m.requester_id || u === m.matched_gm_id,
      };
    }
    case "lfg_post": {
      const p = c.prepare("SELECT p.id, p.author_id, p.title, p.body, p.status, u.name FROM lfg_posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?").get(id) as
        | { id: number; author_id: number; title: string; body: string; status: string; name: string } | undefined;
      if (!p) return null;
      return { ownerId: p.author_id, href: `/board/${p.id}`, snapshot: `Notice “${p.title}” by ${p.name}\n${p.body}`, canSee: () => true };
    }
    case "lfg_reply": {
      const r = c.prepare("SELECT r.author_id, r.body, p.id AS post_id, p.title, u.name FROM lfg_replies r JOIN lfg_posts p ON p.id = r.post_id JOIN users u ON u.id = r.author_id WHERE r.id = ?").get(id) as
        | { author_id: number; body: string; post_id: number; title: string; name: string } | undefined;
      if (!r) return null;
      return { ownerId: r.author_id, href: `/board/${r.post_id}`, snapshot: `Reply on notice “${r.title}”, ${r.name}:\n${r.body}`, canSee: () => true };
    }
    case "user": {
      const u = c.prepare("SELECT u.id, u.name, u.deleted_at, COALESCE(p.headline, '') AS headline, COALESCE(p.payment_info, '') AS payment_info FROM users u LEFT JOIN gm_profiles p ON p.user_id = u.id WHERE u.id = ?").get(id) as
        | { id: number; name: string; deleted_at: string | null; headline: string; payment_info: string } | undefined;
      if (!u || u.deleted_at) return null;
      return {
        ownerId: u.id, href: `/gms/${u.id}`,
        snapshot: `Member ${u.name}${u.headline ? ` — ${u.headline}` : ""}${u.payment_info ? `\nPayment details: ${u.payment_info}` : ""}`,
        canSee: () => true,
      };
    }
  }
}

export type CreateReportResult = "ok" | "notFound" | "own" | "duplicate";

export function createReport(reporterId: number, type: ReportTarget, id: number, reason: ReportReason, details: string): CreateReportResult {
  const target = resolveTarget(type, id);
  if (!target || !target.canSee(reporterId)) return "notFound";
  if (target.ownerId === reporterId) return "own";
  const dup = db().prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'").get(reporterId, type, id);
  if (dup) return "duplicate";
  tx((c) => {
    const reportId = Number(
      c.prepare(
        `INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(reporterId, type, id, target.ownerId, reason, details, target.snapshot, target.href).lastInsertRowid,
    );
    const admins = c.prepare("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL").all() as { id: number }[];
    for (const a of admins) notify({ userId: a.id, kind: "report_new", actorId: reporterId, reportId }, c);
  });
  return "ok";
}

export type ReportRow = {
  id: number; target_type: ReportTarget; target_id: number; target_owner_id: number; reason: ReportReason; details: string;
  snapshot: string; href: string; status: "open" | "resolved" | "dismissed"; decision: ReportDecision | null; note: string;
  created_at: string; resolved_at: string | null; reporter_name: string; owner_name: string; owner_suspended: number; resolver_name: string | null;
  same_target_open: number;
};

export function listReports(status: "open" | "resolved" | "dismissed", limit = 100): ReportRow[] {
  return db()
    .prepare(
      `SELECT r.*, rp.name AS reporter_name, o.name AS owner_name, (o.suspended_at IS NOT NULL) AS owner_suspended, a.name AS resolver_name,
              (SELECT COUNT(*) FROM reports x WHERE x.target_type = r.target_type AND x.target_id = r.target_id AND x.status = 'open') AS same_target_open
         FROM reports r JOIN users rp ON rp.id = r.reporter_id JOIN users o ON o.id = r.target_owner_id LEFT JOIN users a ON a.id = r.resolved_by
        WHERE r.status = ? ORDER BY ${status === "open" ? "r.created_at ASC" : "r.resolved_at DESC"} LIMIT ?`,
    )
    .all(status, limit) as ReportRow[];
}

export type AdminAction = "suspend" | "unsuspend" | "verify" | "unverify" | "report_remove" | "report_suspend" | "report_dismiss";

/** Record a moderator action (shown on the admin home). */
export function logAdminAction(adminId: number, action: AdminAction, targetUserId: number | null, detail = "", c: DatabaseSync = db()): void {
  c.prepare("INSERT INTO admin_log (admin_id, action, target_user_id, detail) VALUES (?, ?, ?, ?)").run(adminId, action, targetUserId, detail.slice(0, 300));
}

export type AdminLogRow = { id: number; action: AdminAction; detail: string; created_at: string; admin_name: string | null; target_name: string | null; target_user_id: number | null };

export function listAdminLog(limit = 15): AdminLogRow[] {
  return db()
    .prepare(
      `SELECT l.id, l.action, l.detail, l.created_at, a.name AS admin_name, t.name AS target_name, l.target_user_id
         FROM admin_log l LEFT JOIN users a ON a.id = l.admin_id LEFT JOIN users t ON t.id = l.target_user_id
        ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
    )
    .all(limit) as AdminLogRow[];
}

/** Suspend a member: no login, sessions ended, GM profile hidden, games archived (players notified). */
export function suspendUser(userId: number, adminId: number): boolean {
  const u = db().prepare("SELECT role, suspended_at FROM users WHERE id = ? AND deleted_at IS NULL").get(userId) as { role: string; suspended_at: string | null } | undefined;
  if (!u || u.role === "admin" || u.suspended_at) return false;
  tx((c) => {
    // Before their games are archived: players with upcoming seats, and requesters who chose them in the last 90 days,
    // are told not to pay (and what to do if they already did).
    const now = new Date();
    const warn = c.prepare(
      `SELECT DISTINCT b.player_id AS id FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id
        WHERE g.gm_id = ? AND b.status = 'confirmed' AND s.status = 'scheduled' AND s.starts_at > ?
       UNION
       SELECT requester_id FROM gm_requests WHERE matched_gm_id = ? AND status = 'matched' AND created_at > ?`,
    ).all(userId, now.toISOString(), userId, new Date(now.getTime() - 90 * 86_400_000).toISOString()) as { id: number }[];
    for (const w of warn) notify({ userId: w.id, kind: "gm_suspended", actorId: userId }, c);
    c.prepare("UPDATE users SET suspended_at = ? WHERE id = ?").run(now.toISOString(), userId);
    c.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
    dropFromWaitlists(c, userId);
    c.prepare("UPDATE lfg_posts SET status = 'closed' WHERE author_id = ? AND status = 'open'").run(userId);
    const games = c.prepare("SELECT id FROM games WHERE gm_id = ? AND status <> 'archived'").all(userId) as { id: number }[];
    for (const g of games) archiveGame(c, g.id, adminId);
    c.prepare("UPDATE gm_requests SET status = 'closed' WHERE requester_id = ? AND status = 'open'").run(userId);
    // Pending offers are withdrawn so nobody can pick a suspended GM.
    c.prepare("DELETE FROM gm_request_offers WHERE gm_id = ? AND request_id IN (SELECT id FROM gm_requests WHERE status = 'open')").run(userId);
  });
  return true;
}

export function unsuspendUser(userId: number): boolean {
  return Number(db().prepare("UPDATE users SET suspended_at = NULL WHERE id = ? AND suspended_at IS NOT NULL").run(userId).changes) > 0;
}

/** Apply an admin decision to a report (and to every other open report about the same thing). */
export function decideReport(reportId: number, adminId: number, decision: ReportDecision, note: string): boolean {
  const r = db().prepare("SELECT * FROM reports WHERE id = ? AND status = 'open'").get(reportId) as ReportRow | undefined;
  if (!r) return false;
  if (decision === "suspend") {
    const owner = db().prepare("SELECT role, suspended_at FROM users WHERE id = ?").get(r.target_owner_id) as { role: string; suspended_at: string | null } | undefined;
    if (!owner || owner.role === "admin") return false; // admins can't be suspended from a report
    if (!owner.suspended_at) suspendUser(r.target_owner_id, adminId);
  }
  tx((c) => {
    if (decision === "remove") {
      if (r.target_type === "review") c.prepare("DELETE FROM reviews WHERE id = ?").run(r.target_id);
      else if (r.target_type === "review_reply") c.prepare("UPDATE reviews SET gm_reply = '', gm_replied_at = NULL WHERE id = ?").run(r.target_id);
      else if (r.target_type === "message") c.prepare("DELETE FROM messages WHERE id = ?").run(r.target_id);
      else if (r.target_type === "request_message") c.prepare("DELETE FROM gm_request_messages WHERE id = ?").run(r.target_id);
      else if (r.target_type === "game") archiveGame(c, r.target_id, adminId);
      else if (r.target_type === "lfg_post") c.prepare("DELETE FROM lfg_posts WHERE id = ?").run(r.target_id);
      else if (r.target_type === "lfg_reply") c.prepare("DELETE FROM lfg_replies WHERE id = ?").run(r.target_id);
      // The author learns what was removed and why (never which moderator, never who reported it).
      if (r.target_type !== "user") notify({ userId: r.target_owner_id, kind: "content_removed", reportId: r.id }, c);
    }
    logAdminAction(adminId, `report_${decision}`, r.target_owner_id, `${r.target_type} #${r.target_id}${note ? ` — ${note}` : ""}`, c);
    const status = decision === "dismiss" ? "dismissed" : "resolved";
    const affected = c
      .prepare(
        `UPDATE reports SET status = ?, decision = ?, note = ?, resolved_by = ?, resolved_at = ?
          WHERE status = 'open' AND target_type = ? AND target_id = ? RETURNING reporter_id, id`,
      )
      .all(status, decision, note, adminId, new Date().toISOString(), r.target_type, r.target_id) as { reporter_id: number; id: number }[];
    for (const a of affected) notify({ userId: a.reporter_id, kind: "report_resolved", actorId: adminId, reportId: a.id }, c);
  });
  return true;
}

export function setGmVerified(userId: number, verified: boolean): boolean {
  return Number(db().prepare("UPDATE gm_profiles SET verified = ? WHERE user_id = ? AND verified <> ?").run(verified ? 1 : 0, userId, verified ? 1 : 0).changes) > 0;
}

export function adminStats() {
  const n = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    openReports: n("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    unverifiedGms: n("SELECT COUNT(*) AS n FROM gm_profiles p JOIN users u ON u.id = p.user_id WHERE p.verified = 0 AND p.headline <> '' AND u.deleted_at IS NULL AND u.suspended_at IS NULL"),
    suspended: n("SELECT COUNT(*) AS n FROM users WHERE suspended_at IS NOT NULL"),
    members: n("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL"),
  };
}

/** Launch pulse: activity in the last `days` days. */
export function launchMetrics(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const n = (sql: string) => (db().prepare(sql).get(since) as { n: number }).n;
  return {
    signups: n("SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND deleted_at IS NULL"),
    gamesPublished: n("SELECT COUNT(*) AS n FROM games WHERE status = 'published' AND COALESCE(announced_at, created_at) >= ?"),
    seatsBooked: n("SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND created_at >= ?"),
    questions: n("SELECT COUNT(*) AS n FROM game_questions WHERE created_at >= ?"),
    notices: n("SELECT COUNT(*) AS n FROM lfg_posts WHERE created_at >= ?"),
    gmRequests: n("SELECT COUNT(*) AS n FROM gm_requests WHERE created_at >= ?"),
  };
}

export type AdminGmRow = { id: number; name: string; email: string; headline: string; verified: number; games: number; open_reports: number; suspended: number; created_at: string };

export function listGmsForAdmin(q: string): AdminGmRow[] {
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return db()
    .prepare(
      `SELECT u.id, u.name, u.email, p.headline, p.verified, u.created_at, (u.suspended_at IS NOT NULL) AS suspended,
              (SELECT COUNT(*) FROM games g WHERE g.gm_id = u.id AND g.status = 'published') AS games,
              (SELECT COUNT(*) FROM reports r WHERE r.target_owner_id = u.id AND r.status = 'open') AS open_reports
         FROM users u JOIN gm_profiles p ON p.user_id = u.id
        WHERE u.deleted_at IS NULL AND p.headline <> '' AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
        ORDER BY p.verified ASC, u.created_at DESC LIMIT 100`,
    )
    .all(like, like) as AdminGmRow[];
}

export type AdminUserRow = { id: number; name: string; email: string; role: string; suspended_at: string | null; created_at: string; open_reports: number; has_gm_profile: number };

export function listUsersForAdmin(q: string): AdminUserRow[] {
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return db()
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.suspended_at, u.created_at,
              EXISTS (SELECT 1 FROM gm_profiles p WHERE p.user_id = u.id AND p.headline <> '') AS has_gm_profile,
              (SELECT COUNT(*) FROM reports r WHERE r.target_owner_id = u.id AND r.status = 'open') AS open_reports
         FROM users u
        WHERE u.deleted_at IS NULL AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
        ORDER BY (u.suspended_at IS NULL), open_reports DESC, u.created_at DESC LIMIT 100`,
    )
    .all(like, like) as AdminUserRow[];
}
