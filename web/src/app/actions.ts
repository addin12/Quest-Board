"use server";

import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, tx } from "@/lib/db";
import { SESSION_COOKIE, createSession, destroyAllSessions, destroySession, getCurrentUser, purgeExpiredSessions, requireAdmin, requireGm, requireUser, rotateSession } from "@/lib/auth";
import { clientIp, hit, purgeOldWindows } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { canBook, canCancel, isSafeNext, normalizeLocation, slugify } from "@/lib/policy";
import { isAllowedCover, isAllowedPortrait } from "@/lib/placeholders";
import { parseGame, parseGmRequest, parseOffer, parseProfile, parseRepeat, parseReview, parseSessionStart, parseSignup, weeklyStarts, type FieldErrors } from "@/lib/validation";
import { normalizeCategories } from "@/lib/categories";
import { canReview, getGameById, getGmRequest, getGmSettings, getSessionWithGame, isGameMember, maxSeatsTakenUpcoming, removedFromSession } from "@/lib/queries";
import { LANG_COOKIE, type MsgKey } from "@/lib/i18n/dict";
import { markAllRead, notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/mailer";
import { movedEmail, seatRemovedEmail } from "@/lib/session-mail";
import { deliverNotificationEmails } from "@/lib/notification-mail";
import { consumeToken, issueToken, peekToken } from "@/lib/tokens";
import { archiveGame, deleteAccount } from "@/lib/account";
import { createReport, decideReport, setGmVerified, suspendUser, unsuspendUser, logAdminAction } from "@/lib/moderation";
import { isReportDecision, parseReport } from "@/lib/reports";
import { heldSeats, joinWaitlist, leaveWaitlist, processWaitlist } from "@/lib/waitlist";
import { addReply, announceGameIfNew, createNotice, getNotice, renewNotice, setFollowing, setSaved, updateNotice } from "@/lib/community";
import { parseNotice, parseReply } from "@/lib/board";
import { toast } from "@/lib/toast";
import { LEGAL_VERSION } from "@/lib/legal";
import { askQuestion, getQuestionThread, replyQuestion } from "@/lib/questions";
import { getI18n } from "@/lib/i18n/server";
import { siteOrigin } from "@/lib/site";

/**
 * Errors are translation keys; client forms render them with t().
 * `values` echoes what the user submitted (never passwords) so forms can
 * refill themselves: React 19 resets a form after its action runs.
 */
export type FormState = { error?: MsgKey; fieldErrors?: FieldErrors; ok?: boolean; values?: Record<string, string> } | undefined;

const fd = (f: FormData) => Object.fromEntries(f.entries());

const NEVER_ECHO = new Set(["password", "currentPassword", "newPassword"]);

/** The submitted text fields, minus secrets and Next's internal "$ACTION…" entries. */
function echo(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && !k.startsWith("$") && !NEVER_ECHO.has(k)) out[k] = k in out ? `${out[k]},${v}` : v;
  }
  return out;
}

/** Run a form action; on a failed result, echo the submitted values back. */
async function withEcho(form: FormData, run: () => Promise<FormState>): Promise<FormState> {
  const result = await run();
  return result && !result.ok ? { ...result, values: echo(form) } : result;
}

/** True for SQLite UNIQUE / PRIMARY KEY violations (e.g. a double-submitted form racing itself). */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/** Only allow same-site relative redirects after login (see isSafeNext). */
function safeNext(next: FormDataEntryValue | null): string {
  return isSafeNext(next) ? next : "/dashboard";
}

// ─── Language ────────────────────────────────────────────────────────────

export async function setLanguageAction(form: FormData) {
  const lang = form.get("lang") === "en" ? "en" : "id";
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  // On a language URL (/id/..., /en/...), the prefix decides the language: go to the other one.
  const path = (await headers()).get("x-qb-path") ?? "";
  const m = path.match(/^\/(en|id)(\/.*)?$/);
  if (m && m[1] !== lang) redirect(`/${lang}${m[2] ?? ""}`);
}

// ─── Theme ───────────────────────────────────────────────────────────────

export async function setThemeAction(form: FormData) {
  const v = form.get("theme");
  const theme = v === "light" || v === "dark" ? v : "system";
  const jar = await cookies();
  if (theme === "system") jar.delete("qb_theme");
  else jar.set("qb_theme", theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

// ─── Auth ────────────────────────────────────────────────────────────────

async function signupActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const parsed = parseSignup(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors };
  const { name, email, password, role } = parsed.value;
  if (!hit("signup", await clientIp())) return { error: "err.rateLimited" };
  const after = role === "gm" ? "/gm" : safeNext(form.get("next"));

  // Never reveal whether an address is registered: an existing account gets the same "check your
  // email" page as a new one, and its owner a heads-up (at most twice an hour) instead of a link.
  const existing = db().prepare("SELECT email, name FROM users WHERE email = ? AND deleted_at IS NULL").get(email) as { email: string; name: string } | undefined;
  if (existing) {
    if (hit("signupNotice", email)) await sendSignupAttemptEmail(existing.email, existing.name);
    redirect("/signup/check-email");
  }

  let userId: number;
  try {
    userId = tx((c) => {
      const id = Number(
        c
          .prepare("INSERT INTO users (email, password_hash, name, role, avatar_hue, terms_accepted_at, terms_version) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(email, hashPassword(password), name, role, Math.floor(Math.random() * 360), new Date().toISOString(), LEGAL_VERSION).lastInsertRowid,
      );
      if (role === "gm") c.prepare("INSERT INTO gm_profiles (user_id) VALUES (?)").run(id);
      return id;
    });
  } catch (err) {
    // Two sign-ups with the same email at the same moment: the second hits the UNIQUE index.
    if (isUniqueViolation(err)) redirect("/signup/check-email");
    throw err;
  }
  // Signed in only once they open the emailed link (it proves the address is theirs).
  await sendVerificationEmail(userId, email, name, after);
  redirect("/signup/check-email");
}

async function loginActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();
  if (!hit("loginIp", ip) || !hit("login", `${ip}:${email}`)) return { error: "err.rateLimited" };
  const user = db().prepare("SELECT id, password_hash, suspended_at FROM users WHERE email = ? AND deleted_at IS NULL").get(email) as
    | { id: number; password_hash: string; suspended_at: string | null }
    | undefined;
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !verifyPassword(password, user.password_hash)) return { error: "err.badLogin" };
  if (user.suspended_at) return { error: "err.suspended" };
  purgeExpiredSessions();
  purgeOldWindows();
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

/** Revoke every session of the current user (e.g. after using a shared computer). */
export async function logoutEverywhereAction() {
  const user = await requireUser();
  await destroyAllSessions(user.id);
  redirect("/login");
}

async function becomeGmActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/become-a-gm");
  const headline = String(form.get("headline") ?? "").trim().slice(0, 100);
  const systems = String(form.get("systems") ?? "").trim().slice(0, 300);
  const years = Math.max(0, Math.min(60, Number(form.get("years") ?? 0) || 0));
  const location = normalizeLocation(String(form.get("location") ?? ""));
  const bio = String(form.get("bio") ?? "").trim().slice(0, 2000);
  const paymentInfo = String(form.get("paymentInfo") ?? "").trim().slice(0, 500);
  const avatarImage = String(form.get("avatarImage") ?? "");
  const currentAvatar = (db().prepare("SELECT avatar_image FROM users WHERE id = ?").get(user.id) as { avatar_image: string }).avatar_image;
  const fieldErrors: FieldErrors = {};
  // Only library portraits, "" (initials) or the current portrait — never an arbitrary URL.
  if (!isAllowedPortrait(avatarImage, currentAvatar)) fieldErrors.avatarImage = "v.portrait";
  if (headline.length < 5) fieldErrors.headline = "v.headline";
  if (bio.length < 30) fieldErrors.bio = "v.bio";
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  const before = db().prepare("SELECT payment_info FROM gm_profiles WHERE user_id = ?").get(user.id) as { payment_info: string } | undefined;

  tx((c) => {
    c.prepare("UPDATE users SET bio = ?, avatar_image = ?, role = CASE WHEN role = 'admin' THEN role ELSE 'gm' END WHERE id = ?").run(bio, avatarImage, user.id);
    c.prepare(
      `INSERT INTO gm_profiles (user_id, headline, systems, years_experience, location, payment_info) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET headline = excluded.headline, systems = excluded.systems,
         years_experience = excluded.years_experience, location = excluded.location, payment_info = excluded.payment_info`,
    ).run(user.id, headline, systems, years, location, paymentInfo);
  });
  if (user.role === "player") await rotateSession(user.id); // role changed: issue a fresh session token
  // Players pay the GM directly, so new payment details are what a hijacked account would change: tell the owner.
  if (before?.payment_info && before.payment_info !== paymentInfo) await sendPaymentDetailsChangedEmail(user.email, user.name, paymentInfo);
  revalidatePath("/", "layout");
  redirect("/gm");
}

// ─── Games (GM) ──────────────────────────────────────────────────────────

function uniqueSlug(title: string, excludeId?: number): string {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; ; i++) {
    const row = db().prepare("SELECT id FROM games WHERE slug = ?").get(slug) as { id: number } | undefined;
    if (!row || row.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

async function saveGameActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const gm = await requireGm();
  const parsed = parseGame(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors, error: "err.fixFields" };
  const g = parsed.value;
  const idRaw = Number(form.get("id") ?? 0);
  const hue = Math.max(0, Math.min(359, Number(form.get("coverHue") ?? 260) || 0));
  const coverImage = String(form.get("coverImage") ?? "");
  const genres = normalizeCategories(form.getAll("genres").map(String), "genre");
  const styles = normalizeCategories(form.getAll("styles").map(String), "style");
  const existing = idRaw ? getGameById(idRaw) : undefined;
  // Only library art, "" (gradient) or the game's current cover — never an arbitrary URL.
  if (!isAllowedCover(coverImage, existing?.cover_image ?? "")) {
    return { fieldErrors: { coverImage: "v.cover" }, error: "err.fixFields" };
  }

  let gameId: number;
  if (idRaw) {
    if (!existing || (existing.gm_id !== gm.id && gm.role !== "admin")) return { error: "err.notFound" };
    // Never let an edit overbook: seats can't drop below what an upcoming session already holds.
    const seatsTaken = maxSeatsTakenUpcoming(idRaw);
    if (g.seatsTotal < seatsTaken) {
      return { fieldErrors: { seatsTotal: "v.seatsBelowBooked" }, error: "err.fixFields" };
    }
    // Unpublishing would hide the game from players who hold seats (and stop their reminders).
    if (g.status === "draft" && existing.status === "published" && seatsTaken > 0) {
      return { fieldErrors: { status: "v.unpublishBooked" }, error: "err.fixFields" };
    }
    // Once published, the address never changes: it's in shared links, emails and calendars.
    const slug = existing.status === "draft" && !existing.announced_at ? uniqueSlug(g.title, idRaw) : existing.slug;
    const placeChanged = existing.location_type !== g.locationType || existing.city !== g.city || existing.platform !== g.platform;
    db()
      .prepare(
        `UPDATE games SET slug = ?, title = ?, system = ?, summary = ?, description = ?, format = ?, location_type = ?, language = ?, platform = ?, city = ?,
           price_idr = ?, seats_total = ?, experience_level = ?, min_age = ?, content_warnings = ?, safety_tools = ?, tags = ?, cover_hue = ?, cover_image = ?, genres = ?, styles = ?, status = ?
         WHERE id = ?`,
      )
      .run(
        slug, g.title, g.system, g.summary, g.description, g.format, g.locationType, g.language, g.platform, g.city,
        g.priceIdr, g.seatsTotal, g.experienceLevel, g.minAge, g.contentWarnings, g.safetyTools, g.tags, hue, coverImage, genres, styles, g.status, idRaw,
      );
    gameId = idRaw;
    // More seats (or re-publishing) may free places for people on the waitlist.
    const upcomingIds = db().prepare("SELECT id FROM game_sessions WHERE game_id = ? AND status = 'scheduled' AND starts_at > ?").all(idRaw, new Date().toISOString()) as { id: number }[];
    tx((c) => {
      for (const u of upcomingIds) processWaitlist(c, u.id);
      // Players with a seat need to know if the table moved (another city, online ↔ in person, another platform).
      if (placeChanged && g.status === "published") {
        const players = c.prepare(
          `SELECT DISTINCT b.player_id FROM bookings b JOIN game_sessions s ON s.id = b.session_id
            WHERE s.game_id = ? AND s.status = 'scheduled' AND s.starts_at > ? AND b.status = 'confirmed'`,
        ).all(idRaw, new Date().toISOString()) as { player_id: number }[];
        for (const p of players) notify({ userId: p.player_id, kind: "game_place_changed", actorId: gm.id, gameId: idRaw }, c);
      }
    });
  } else {
    gameId = Number(
      db()
        .prepare(
          `INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, platform, city,
             price_idr, seats_total, experience_level, min_age, content_warnings, safety_tools, tags, cover_hue, cover_image, genres, styles, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          gm.id, uniqueSlug(g.title), g.title, g.system, g.summary, g.description, g.format, g.locationType, g.language, g.platform, g.city,
          g.priceIdr, g.seatsTotal, g.experienceLevel, g.minAge, g.contentWarnings, g.safetyTools, g.tags, hue, coverImage, genres, styles, g.status,
        ).lastInsertRowid,
    );
  }
  announceGameIfNew(gameId); // first publish → tell the GM's followers
  revalidatePath("/", "layout");
  redirect(`/gm/games/${gameId}`);
}

export async function archiveGameAction(form: FormData) {
  const gm = await requireGm();
  const game = getGameById(Number(form.get("gameId")));
  if (!game || (game.gm_id !== gm.id && gm.role !== "admin")) throw new Error("Not found");
  // Archiving hides the game page from players, so release every future seat
  // instead of leaving players holding seats they can no longer see.
  tx((c) => archiveGame(c, game.id, gm.id));
  await sendQueuedEmails(); // booked players are told by email too
  revalidatePath("/", "layout");
  redirect("/gm");
}

async function ownedGameOrThrow(gameId: number) {
  const gm = await requireGm();
  const game = getGameById(gameId);
  if (!game || (game.gm_id !== gm.id && gm.role !== "admin")) throw new Error("Not found");
  return { gm, game };
}

async function addSessionActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const { game } = await ownedGameOrThrow(Number(form.get("gameId")));
  const start = parseSessionStart(form.get("startsAt"), form.get("tzOffset"), new Date());
  if (!start.ok) return { fieldErrors: start.errors };
  const duration = Math.max(30, Math.min(720, Number(form.get("duration") ?? 180) || 180));
  const starts = weeklyStarts(start.value, parseRepeat(form.get("repeat")));
  tx((c) => {
    const ins = c.prepare("INSERT INTO game_sessions (game_id, starts_at, duration_minutes) VALUES (?, ?, ?)");
    for (const d of starts) ins.run(game.id, d.toISOString(), duration);
  });
  revalidatePath("/", "layout");
  return { ok: true, values: { added: String(starts.length) } };
}

/** GM cancels a session: every reserved seat is released. Any refund is between GM and player. */
export async function cancelSessionAction(form: FormData) {
  const sessionId = Number(form.get("sessionId"));
  const s = getSessionWithGame(sessionId);
  if (!s) throw new Error("Not found");
  await ownedGameOrThrow(s.game_id);
  // Past, completed or already-cancelled sessions can't be "cancelled" (players would be told so).
  if (s.status !== "scheduled" || new Date(s.starts_at) <= new Date()) throw new Error("Only upcoming sessions can be cancelled");
  const reason = String(form.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  tx((c) => {
    // The notification also queues the cancellation email (lib/notification-mail.ts), with the reason.
    const booked = c.prepare("SELECT player_id FROM bookings WHERE session_id = ? AND status = 'confirmed'").all(sessionId) as { player_id: number }[];
    for (const b of booked) notify({ userId: b.player_id, kind: "session_cancelled", actorId: s.gm_id, sessionId }, c);
    c.prepare("UPDATE game_sessions SET status = 'cancelled', cancel_reason = ? WHERE id = ?").run(reason, sessionId);
    c.prepare("UPDATE waitlist SET status = 'expired' WHERE session_id = ? AND status IN ('waiting','offered')").run(sessionId);
    c.prepare(
      "UPDATE bookings SET status = 'cancelled', cancelled_by = 'gm', cancelled_at = ? WHERE session_id = ? AND status = 'confirmed'",
    ).run(new Date().toISOString(), sessionId);
  });
  await sendQueuedEmails();
  await toast("toast.sessionCancelled");
  revalidatePath("/", "layout");
}

/** GM changes an upcoming session's time or length. Seats stay booked; players are told and reminders start over. */
async function rescheduleSessionActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const sessionId = Number(form.get("sessionId"));
  const s = getSessionWithGame(sessionId);
  if (!s) return { error: "err.notFound" };
  await ownedGameOrThrow(s.game_id);
  if (s.status !== "scheduled") return { error: "err.notScheduled" };
  if (new Date(s.starts_at) <= new Date()) return { error: "err.started" };
  const start = parseSessionStart(form.get("startsAt"), form.get("tzOffset"), new Date());
  if (!start.ok) return { fieldErrors: start.errors };
  const duration = Math.max(30, Math.min(720, Number(form.get("duration") ?? s.duration_minutes) || s.duration_minutes));
  const startsAt = start.value.toISOString();
  if (startsAt === new Date(s.starts_at).toISOString() && duration === s.duration_minutes) return { fieldErrors: { startsAt: "v.sameTime" } };
  const booked = tx((c) => {
    c.prepare("UPDATE game_sessions SET starts_at = ?, duration_minutes = ?, reschedule_count = reschedule_count + 1 WHERE id = ?").run(startsAt, duration, sessionId);
    c.prepare("DELETE FROM session_reminders WHERE session_id = ?").run(sessionId); // remind again for the new time
    const booked = c.prepare("SELECT player_id FROM bookings WHERE session_id = ? AND status = 'confirmed'").all(sessionId) as { player_id: number }[];
    for (const b of booked) notify({ userId: b.player_id, kind: "session_moved", actorId: s.gm_id, sessionId }, c);
    // People waiting for a seat (or holding an offered one) need the new time too.
    const waiting = c.prepare("SELECT player_id FROM waitlist WHERE session_id = ? AND status IN ('waiting','offered')").all(sessionId) as { player_id: number }[];
    for (const w of waiting) notify({ userId: w.player_id, kind: "waitlist_session_moved", actorId: s.gm_id, sessionId }, c);
    return booked;
  });
  if (booked.length > 0) {
    const origin = await siteOrigin();
    const ids = booked.map((b) => b.player_id);
    const people = db()
      .prepare(`SELECT email, name, locale FROM users WHERE id IN (${ids.map(() => "?").join(",")}) AND email_verified_at IS NOT NULL AND deleted_at IS NULL`)
      .all(...ids) as { email: string; name: string; locale: "en" | "id" }[];
    await Promise.allSettled(people.map((p) => sendEmail(movedEmail(p, s, s, { starts_at: startsAt, duration_minutes: duration }, origin))));
  }
  await toast(booked.length > 0 ? "toast.sessionMoved" : "toast.sessionMovedNoPlayers");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** GM releases one player's seat in an upcoming session (e.g. they never replied, or broke the table rules). */
export async function removePlayerAction(form: FormData) {
  const b = db()
    .prepare(
      `SELECT b.id, b.player_id, b.status, b.session_id, s.status AS session_status, s.starts_at, s.game_id
         FROM bookings b JOIN game_sessions s ON s.id = b.session_id WHERE b.id = ?`,
    )
    .get(Number(form.get("bookingId"))) as
    | { id: number; player_id: number; status: string; session_id: number; session_status: string; starts_at: string; game_id: number } | undefined;
  if (!b) throw new Error("Not found");
  const { gm } = await ownedGameOrThrow(b.game_id);
  if (b.status !== "confirmed" || b.session_status !== "scheduled" || new Date(b.starts_at) <= new Date()) throw new Error("Only upcoming seats can be released");
  const reason = String(form.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  tx((c) => {
    c.prepare("UPDATE bookings SET status = 'cancelled', cancelled_by = 'gm', cancelled_at = ? WHERE id = ? AND status = 'confirmed'").run(new Date().toISOString(), b.id);
    notify({ userId: b.player_id, kind: "seat_removed", actorId: gm.id, sessionId: b.session_id }, c);
    processWaitlist(c, b.session_id); // the freed seat goes to the next person waiting
  });
  const s = getSessionWithGame(b.session_id);
  const p = db().prepare("SELECT email, name, locale FROM users WHERE id = ? AND email_verified_at IS NOT NULL AND deleted_at IS NULL").get(b.player_id) as
    | { email: string; name: string; locale: "en" | "id" } | undefined;
  if (s && p) await sendEmail(seatRemovedEmail(p, s, reason, await siteOrigin()));
  await toast("toast.playerRemoved");
  revalidatePath("/", "layout");
}

export async function completeSessionAction(form: FormData) {
  const sessionId = Number(form.get("sessionId"));
  const s = getSessionWithGame(sessionId);
  if (!s) throw new Error("Not found");
  await ownedGameOrThrow(s.game_id);
  if (new Date(s.starts_at) > new Date()) throw new Error("Session has not started yet");
  db().prepare("UPDATE game_sessions SET status = 'completed' WHERE id = ? AND status = 'scheduled'").run(sessionId);
  revalidatePath("/", "layout");
}

/** Send queued notification emails now (a cancellation shouldn't wait for the next cron run). Never fails the action. */
async function sendQueuedEmails() {
  await deliverNotificationEmails(await siteOrigin()).catch((err) => console.error("[quest-board] notification emails failed", err));
}

/** Copy one of my games (details, categories, cover) as a new draft, without sessions. */
export async function duplicateGameAction(form: FormData) {
  const { gm, game } = await ownedGameOrThrow(Number(form.get("gameId")));
  const { t } = await getI18n();
  const title = t("manage.copyTitle", { title: game.title }).slice(0, 100);
  const id = Number(
    db()
      .prepare(
        `INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, platform, city,
           price_idr, seats_total, experience_level, min_age, content_warnings, safety_tools, tags, cover_hue, cover_image, genres, styles, status)
         SELECT ?, ?, ?, system, summary, description, format, location_type, language, platform, city,
           price_idr, seats_total, experience_level, min_age, content_warnings, safety_tools, tags, cover_hue, cover_image, genres, styles, 'draft'
           FROM games WHERE id = ?`,
      )
      .run(game.gm_id === gm.id ? gm.id : game.gm_id, uniqueSlug(title), title, game.id).lastInsertRowid,
  );
  await toast("toast.gameDuplicated");
  revalidatePath("/", "layout");
  redirect(`/gm/games/${id}/edit`);
}

// ─── Bookings (player) ───────────────────────────────────────────────────

/** Reserve a seat. No payment happens on Quest Board — the player pays the GM directly. */
async function reserveSeatActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const sessionId = Number(form.get("sessionId"));
  const user = await requireUser(`/book/${sessionId}`);
  if (form.get("agree") !== "on") return { error: "err.mustAgree" };
  if (!hit("reserve", String(user.id))) return { error: "err.rateLimited" };

  const bookingError = tx((c): MsgKey | null => {
    // Re-check inside the write transaction so two players can't take the last seat.
    const s = getSessionWithGame(sessionId);
    if (!s) return "err.notFound";
    processWaitlist(c, sessionId);
    const already = c
      .prepare("SELECT 1 FROM bookings WHERE session_id = ? AND player_id = ? AND status = 'confirmed'")
      .get(sessionId, user.id);
    const verdict = canBook({
      sessionStatus: s.status, gameStatus: s.game_status, startsAt: new Date(s.starts_at), now: new Date(),
      seatsTotal: s.seats_total, seatsTaken: s.seats_taken + heldSeats(c, sessionId, user.id), isGm: s.gm_id === user.id, alreadyBooked: !!already,
      removedByGm: removedFromSession(sessionId, user.id),
    });
    if (!verdict.ok) return verdict.reason;
    // The GM changed the time or price while this page was open: show the new details and ask again.
    const seenAt = form.get("seenStartsAt"), seenPrice = form.get("seenPrice");
    if ((seenAt !== null && String(seenAt) !== s.starts_at) || (seenPrice !== null && Number(seenPrice) !== s.price_idr)) return "err.sessionChanged";
    c.prepare("INSERT INTO bookings (session_id, player_id, status, price_idr) VALUES (?, ?, 'confirmed', ?)").run(
      sessionId, user.id, s.price_idr,
    );
    notify({ userId: s.gm_id, kind: "booking_new", actorId: user.id, sessionId }, c);
    c.prepare("UPDATE waitlist SET status = 'claimed' WHERE session_id = ? AND player_id = ? AND status IN ('waiting','offered')").run(sessionId, user.id);
    return null;
  });
  if (bookingError) {
    if (bookingError === "err.sessionChanged") revalidatePath(`/book/${sessionId}`);
    return { error: bookingError };
  }

  revalidatePath("/", "layout");
  redirect(`/dashboard?booked=${sessionId}`);
}

export async function cancelBookingAction(form: FormData) {
  const user = await requireUser();
  const bookingId = Number(form.get("bookingId"));
  const b = db()
    .prepare(
      `SELECT b.id, b.player_id, b.status, b.session_id, s.starts_at, g.gm_id
         FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id WHERE b.id = ?`,
    )
    .get(bookingId) as { id: number; player_id: number; status: string; session_id: number; starts_at: string; gm_id: number } | undefined;
  if (!b || b.player_id !== user.id || b.status !== "confirmed") throw new Error("Booking not found");
  if (!canCancel(new Date(b.starts_at), new Date())) throw new Error("Session already started");
  db()
    .prepare("UPDATE bookings SET status = 'cancelled', cancelled_by = 'player', cancelled_at = ? WHERE id = ?")
    .run(new Date().toISOString(), b.id);
  notify({ userId: b.gm_id, kind: "booking_cancelled", actorId: user.id, sessionId: b.session_id });
  tx((c) => processWaitlist(c, b.session_id));
  await toast("toast.seatReleased");
  revalidatePath("/", "layout");
}

// ─── Community ───────────────────────────────────────────────────────────

async function postMessageActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "err.signInToPost" };
  const gameId = Number(form.get("gameId"));
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "err.emptyMessage" };
  if (body.length > 1000) return { error: "err.longMessage" };
  if (!isGameMember(gameId, user.id)) return { error: "err.membersOnly" };
  if (!hit("chat", String(user.id))) return { error: "err.rateLimited" };
  db().prepare("INSERT INTO messages (game_id, user_id, body) VALUES (?, ?, ?)").run(gameId, user.id, body);
  revalidatePath("/games/[slug]", "page");
  return { ok: true };
}

async function submitReviewActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const gameId = Number(form.get("gameId"));
  const parsed = parseReview(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors };
  if (!canReview(gameId, user.id)) return { error: "err.reviewNotAllowed" };
  if (!hit("review", String(user.id))) return { error: "err.rateLimited" };
  try {
    db()
      .prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, ?, ?)")
      .run(gameId, user.id, parsed.value.rating, parsed.value.body);
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "err.reviewNotAllowed" }; // double submit
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The game's GM answers a review publicly (empty = remove the answer). The reviewer hears about a new answer. */
async function replyReviewActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = db()
    .prepare("SELECT r.id, r.player_id, r.gm_reply, g.id AS game_id, g.gm_id, g.slug FROM reviews r JOIN games g ON g.id = r.game_id WHERE r.id = ?")
    .get(Number(form.get("reviewId"))) as { id: number; player_id: number; gm_reply: string; game_id: number; gm_id: number; slug: string } | undefined;
  if (!r || r.gm_id !== user.id) return { error: "err.notFound" };
  const reply = String(form.get("reply") ?? "").trim().replace(/\r\n/g, "\n");
  if (reply.length > 1000) return { error: "err.longMessage" };
  if (!hit("chat", String(user.id))) return { error: "err.rateLimited" };
  db().prepare("UPDATE reviews SET gm_reply = ?, gm_replied_at = ? WHERE id = ?").run(reply, reply ? new Date().toISOString() : null, r.id);
  if (reply && !r.gm_reply) notify({ userId: r.player_id, kind: "review_reply", actorId: user.id, gameId: r.game_id });
  await toast(reply ? "toast.replySaved" : "toast.replyRemoved");
  revalidatePath(`/games/${r.slug}`);
  revalidatePath(`/gms/${r.gm_id}`);
  return { ok: true };
}

/** The reviewer changes their own review (rating and text). */
async function updateReviewActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = ownReview(Number(form.get("reviewId")), user.id);
  if (!r) return { error: "err.notFound" };
  const parsed = parseReview(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors };
  if (!hit("review", String(user.id))) return { error: "err.rateLimited" };
  db().prepare("UPDATE reviews SET rating = ?, body = ?, edited_at = ? WHERE id = ?").run(parsed.value.rating, parsed.value.body, new Date().toISOString(), r.id);
  await toast("toast.reviewUpdated");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The reviewer deletes their own review (they may write a new one afterwards). */
export async function deleteReviewAction(form: FormData) {
  const user = await requireUser();
  const r = ownReview(Number(form.get("reviewId")), user.id);
  if (!r) throw new Error("Not found");
  db().prepare("DELETE FROM reviews WHERE id = ?").run(r.id);
  await toast("toast.reviewDeleted");
  revalidatePath("/", "layout");
}

function ownReview(reviewId: number, userId: number) {
  return db().prepare("SELECT id FROM reviews WHERE id = ? AND player_id = ?").get(reviewId, userId) as { id: number } | undefined;
}

// ─── Profile settings (players & GMs) ────────────────────────────────────

async function updateProfileActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/settings");
  const parsed = parseProfile(fd(form));
  const avatarImage = String(form.get("avatarImage") ?? "");
  const fieldErrors: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
  if (!isAllowedPortrait(avatarImage, user.avatar_image)) fieldErrors.avatarImage = "v.portrait";
  if (parsed.ok && (user.role === "gm" || user.role === "admin") && parsed.value.bio.length < 30) fieldErrors.bio = "v.bio";
  if (!parsed.ok || Object.keys(fieldErrors).length) return { fieldErrors, error: "err.fixFields" };
  db().prepare("UPDATE users SET name = ?, bio = ?, avatar_image = ?, email_reminders = ?, email_notifications = ? WHERE id = ?")
    .run(parsed.value.name, parsed.value.bio, avatarImage, form.get("emailReminders") === "1" ? 1 : 0, form.get("emailNotifications") === "1" ? 1 : 0, user.id);
  const lang = form.get("language");
  if (lang === "id" || lang === "en") (await cookies()).set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Change password: verify the current one, then revoke every other session. */
async function changePasswordActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/settings");
  if (!hit("password", String(user.id))) return { error: "err.rateLimited" };
  const current = String(form.get("currentPassword") ?? "");
  const next = String(form.get("newPassword") ?? "");
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash)) return { fieldErrors: { currentPassword: "v.currentPassword" } };
  if (next.length < 8) return { fieldErrors: { newPassword: "v.password" } };
  if (next === current) return { fieldErrors: { newPassword: "v.passwordSame" } };
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
  await destroyAllSessions(user.id); // other devices must log in again…
  await createSession(user.id);      // …but this one stays signed in
  await sendPasswordChangedEmail(user.email, user.name);
  return { ok: true };
}

/** Create (or replace) my private calendar feed link; an old link stops working. */
export async function resetCalendarFeedAction() {
  const user = await requireUser("/settings");
  const token = randomBytes(24).toString("base64url");
  db().prepare("UPDATE users SET calendar_token = ? WHERE id = ?").run(token, user.id);
  await toast("toast.calendarLinkReady");
  revalidatePath("/settings");
}

// ─── Hire a GM ───────────────────────────────────────────────────────────

async function createGmRequestActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/hire-a-gm/request");
  if (!user.email_verified) return { error: "err.verifyEmail" };
  const parsed = parseGmRequest(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors, error: "err.fixFields" };
  // Optional direct request to one GM (from their profile or the directory).
  const gmIdRaw = Number(form.get("gmId") ?? 0) || null;
  if (gmIdRaw) {
    const gm = db().prepare("SELECT 1 FROM users u JOIN gm_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role IN ('gm','admin') AND u.deleted_at IS NULL AND u.suspended_at IS NULL").get(gmIdRaw);
    if (!gm || gmIdRaw === user.id) return { error: "err.notFound" };
  }
  if (!hit("request", String(user.id))) return { error: "err.rateLimited" };
  const r = parsed.value;
  const id = Number(
    db()
      .prepare(
        `INSERT INTO gm_requests (requester_id, gm_id, title, system, group_size, experience_level, language, location_type, city, schedule, budget_idr, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, gmIdRaw, r.title, r.system, r.groupSize, r.experienceLevel, r.language, r.locationType, r.city, r.schedule, r.budgetIdr, r.details)
      .lastInsertRowid,
  );
  if (gmIdRaw) notify({ userId: gmIdRaw, kind: "request_direct", actorId: user.id, requestId: id });
  revalidatePath("/", "layout");
  redirect(`/hire-a-gm/requests/${id}?created=1`);
}

/** A GM answers an open request with a message and a price per player per session. */
async function sendOfferActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const gm = await requireGm();
  const request = getGmRequest(Number(form.get("requestId")));
  if (!request || request.status !== "open" || request.requester_id === gm.id || (request.gm_id && request.gm_id !== gm.id)) {
    return { error: "err.requestClosed" };
  }
  if (!getGmSettings(gm.id)?.headline) return { error: "err.gmProfileIncomplete" };
  if (!gm.email_verified) return { error: "err.verifyEmail" };
  const parsed = parseOffer(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors };
  if (!hit("offer", String(gm.id))) return { error: "err.rateLimited" };
  try {
    db()
      .prepare("INSERT INTO gm_request_offers (request_id, gm_id, message, price_idr) VALUES (?, ?, ?, ?)")
      .run(request.id, gm.id, parsed.value.message, parsed.value.priceIdr);
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "err.alreadyOffered" };
    throw err;
  }
  notify({ userId: request.requester_id, kind: "offer_received", actorId: gm.id, requestId: request.id });
  revalidatePath("/", "layout");
  return { ok: true };
}

async function postRequestMessageActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const request = getGmRequest(Number(form.get("requestId")));
  const body = String(form.get("body") ?? "").trim();
  // Only the requester and the chosen GM talk, and only after a match.
  if (!request || request.status !== "matched" || (user.id !== request.requester_id && user.id !== request.matched_gm_id)) {
    return { error: "err.membersOnly" };
  }
  if (!body) return { error: "err.emptyMessage" };
  if (body.length > 1000) return { error: "err.longMessage" };
  if (!hit("chat", String(user.id))) return { error: "err.rateLimited" };
  db().prepare("INSERT INTO gm_request_messages (request_id, user_id, body) VALUES (?, ?, ?)").run(request.id, user.id, body);
  const other = user.id === request.requester_id ? request.matched_gm_id : request.requester_id;
  if (other) notify({ userId: other, kind: "request_message", actorId: user.id, requestId: request.id });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The requester picks one offer: the request is matched and the private thread opens. */
export async function chooseOfferAction(form: FormData) {
  const user = await requireUser();
  const request = getGmRequest(Number(form.get("requestId")));
  const gmId = Number(form.get("gmId"));
  if (!request || request.requester_id !== user.id) throw new Error("Not found");
  if (request.status !== "open") return; // already matched/closed (double click, another tab)
  const offer = db().prepare("SELECT 1 FROM gm_request_offers WHERE request_id = ? AND gm_id = ?").get(request.id, gmId);
  if (!offer) throw new Error("Not found");
  const res = db().prepare("UPDATE gm_requests SET status = 'matched', matched_gm_id = ? WHERE id = ? AND status = 'open'").run(gmId, request.id);
  if (Number(res.changes) > 0) {
    notify({ userId: gmId, kind: "offer_chosen", actorId: user.id, requestId: request.id });
    for (const o of offeringGms(request.id, gmId)) notify({ userId: o, kind: "offer_not_chosen", actorId: user.id, requestId: request.id });
    await toast("toast.gmChosen");
  }
  revalidatePath("/", "layout");
}

/** GMs who sent an offer on a request (except `except`). */
function offeringGms(requestId: number, except = 0): number[] {
  return (db().prepare("SELECT gm_id FROM gm_request_offers WHERE request_id = ? AND gm_id <> ?").all(requestId, except) as { gm_id: number }[]).map((o) => o.gm_id);
}

export async function closeRequestAction(form: FormData) {
  const user = await requireUser();
  const request = getGmRequest(Number(form.get("requestId")));
  if (!request || request.requester_id !== user.id) throw new Error("Not found");
  // Only open requests can be closed: a matched request keeps its thread and payment details.
  const res = db().prepare("UPDATE gm_requests SET status = 'closed' WHERE id = ? AND status = 'open'").run(request.id);
  if (Number(res.changes) > 0) for (const o of offeringGms(request.id)) notify({ userId: o, kind: "request_closed", actorId: user.id, requestId: request.id });
  await toast("toast.requestClosed");
  revalidatePath("/", "layout");
}

// ─── Email verification, password reset, account deletion ───────────────

async function sendVerificationEmail(userId: number, email: string, name: string, next?: string) {
  const { t } = await getI18n();
  const then = next && next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : "";
  const link = `${await siteOrigin()}/verify-email?token=${issueToken(userId, "verify")}${then}`;
  await sendEmail({ to: email, subject: t("mail.verifySubject"), text: t("mail.verifyBody", { name, link }), secret: link });
}

/** Someone signed up with an address that already has an account: tell its owner (no link that signs anyone in). */
async function sendSignupAttemptEmail(email: string, name: string) {
  const { t, lang } = await getI18n();
  const origin = await siteOrigin();
  await sendEmail({
    to: email,
    subject: t("mail.signupAttemptSubject"),
    text: t("mail.signupAttemptBody", { name, when: nowWib(lang), login: `${origin}/login`, reset: `${origin}/forgot-password` }),
  });
}

/**
 * The button on the emailed link's page (a POST, so mail scanners that open links don't use it up).
 * Confirms the address; the first time, it also signs the person in — that's how a new account starts.
 */
export async function confirmEmailAction(form: FormData) {
  const userId = consumeToken(String(form.get("token") ?? ""), "verify");
  if (!userId) redirect("/verify-email?invalid=1");
  const u = db().prepare("SELECT email_verified_at, suspended_at, deleted_at FROM users WHERE id = ?").get(userId) as
    | { email_verified_at: string | null; suspended_at: string | null; deleted_at: string | null } | undefined;
  if (!u || u.deleted_at) redirect("/verify-email?invalid=1");
  db().prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(new Date().toISOString(), userId);
  const current = await getCurrentUser();
  if (!u.email_verified_at && !u.suspended_at && current?.id !== userId) await createSession(userId);
  await toast("toast.emailVerified");
  redirect(safeNext(form.get("next")));
}

const nowWib = (lang: string) =>
  new Date().toLocaleString(lang === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB";

/** "Your password was changed — if this wasn't you…" (after a change or a reset). */
async function sendPasswordChangedEmail(email: string, name: string) {
  const { t, lang } = await getI18n();
  const link = `${await siteOrigin()}/forgot-password`;
  await sendEmail({ to: email, subject: t("mail.passwordChangedSubject"), text: t("mail.passwordChangedBody", { name, when: nowWib(lang), link }) });
}

/** "Your payment details were changed" — shows what players now see, and what to do if it wasn't the GM. */
async function sendPaymentDetailsChangedEmail(email: string, name: string, details: string) {
  const { t, lang } = await getI18n();
  const link = `${await siteOrigin()}/forgot-password`;
  await sendEmail({
    to: email,
    subject: t("mail.paymentChangedSubject"),
    text: t("mail.paymentChangedBody", { name, when: nowWib(lang), details: details || t("mail.paymentRemoved"), link }),
  });
}

/** Settings / banner: send the verification link again. */
export async function resendVerificationAction(): Promise<FormState> {
  const user = await requireUser("/settings");
  if (user.email_verified) return { ok: true };
  if (!hit("verify", String(user.id))) return { error: "err.rateLimited" };
  await sendVerificationEmail(user.id, user.email, user.name);
  return { ok: true };
}

/** "Forgot password": always answers the same way, whether or not the email has an account. */
async function requestPasswordResetActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { fieldErrors: { email: "v.email" } };
  const ip = await clientIp();
  if (!hit("resetIp", ip) || !hit("reset", `${ip}:${email}`)) return { error: "err.rateLimited" };
  const user = db().prepare("SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL").get(email) as { id: number; name: string } | undefined;
  if (user) {
    const { t } = await getI18n();
    const link = `${await siteOrigin()}/reset-password?token=${issueToken(user.id, "reset")}`;
    await sendEmail({ to: email, subject: t("mail.resetSubject"), text: t("mail.resetBody", { name: user.name, link }), secret: link });
  }
  return { ok: true };
}

async function resetPasswordActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const next = String(form.get("newPassword") ?? "");
  if (next.length < 8) return { fieldErrors: { newPassword: "v.password" } };
  if (!peekToken(token, "reset")) return { error: "err.tokenInvalid" };
  const userId = consumeToken(token, "reset");
  if (!userId) return { error: "err.tokenInvalid" };
  db().prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(hashPassword(next), new Date().toISOString(), userId);
  await destroyAllSessions(userId); // anyone holding an old session is signed out
  await createSession(userId);
  const who = db().prepare("SELECT email, name FROM users WHERE id = ?").get(userId) as { email: string; name: string };
  await sendPasswordChangedEmail(who.email, who.name);
  redirect("/dashboard?reset=1");
}

/** Delete my account: needs the current password and an explicit confirmation. */
async function deleteAccountActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/settings");
  if (!hit("deleteAccount", String(user.id))) return { error: "err.rateLimited" };
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  const fieldErrors: FieldErrors = {};
  if (!verifyPassword(String(form.get("password") ?? ""), row.password_hash)) fieldErrors.deletePassword = "v.currentPassword";
  if (form.get("confirm") !== "on") fieldErrors.confirm = "v.deleteConfirm";
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  deleteAccount(user.id);
  await sendQueuedEmails(); // players of a GM's games are told their sessions are off
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}

// ─── Waitlist & payments ─────────────────────────────────────────────────

export async function joinWaitlistAction(form: FormData) {
  const sessionId = Number(form.get("sessionId"));
  const user = await requireUser(`/games/${String(form.get("slug") ?? "")}`);
  if (removedFromSession(sessionId, user.id)) return revalidatePath("/", "layout"); // the GM released their seat here
  const joined = joinWaitlist(sessionId, user.id); // "notFull" etc. just re-render the page with the right button
  if (joined === "ok") await toast("toast.waitJoined");
  revalidatePath("/", "layout");
}

export async function leaveWaitlistAction(form: FormData) {
  const user = await requireUser();
  leaveWaitlist(Number(form.get("sessionId")), user.id);
  await toast("toast.waitLeft");
  revalidatePath("/", "layout");
}

/** GM ticks (or unticks) "paid ✓" for a seat. Payment itself happens off-platform. */
export async function markPaidAction(form: FormData) {
  const user = await requireGm();
  const bookingId = Number(form.get("bookingId"));
  const b = db()
    .prepare("SELECT b.id, b.player_id, b.session_id, b.status, g.gm_id, g.price_idr FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id WHERE b.id = ?")
    .get(bookingId) as { id: number; player_id: number; session_id: number; status: string; gm_id: number; price_idr: number } | undefined;
  if (!b || (b.gm_id !== user.id && user.role !== "admin") || b.status !== "confirmed") throw new Error("Not found");
  const paid = form.get("paid") === "1";
  db().prepare("UPDATE bookings SET paid_marked_at = ? WHERE id = ?").run(paid ? new Date().toISOString() : null, b.id);
  if (paid) notify({ userId: b.player_id, kind: "payment_confirmed", actorId: user.id, sessionId: b.session_id });
  await toast(paid ? "toast.paidMarked" : "toast.paidUnmarked");
  revalidatePath("/", "layout");
}

// ─── Tavern Notice Board, saved games, follows ───────────────────────────

async function createNoticeActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/board/new");
  if (!user.email_verified) return { error: "err.verifyEmail" };
  const parsed = parseNotice(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors, error: "err.fixFields" };
  if (!hit("notice", String(user.id))) return { error: "err.rateLimited" };
  const id = createNotice(user.id, parsed.value);
  revalidatePath("/board");
  redirect(`/board/${id}?posted=1`);
}

async function replyNoticeActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.email_verified) return { error: "err.verifyEmail" };
  const post = getNotice(Number(form.get("postId")));
  if (!post || post.status !== "open" || new Date(post.expires_at) <= new Date()) return { error: "err.noticeClosed" };
  const parsed = parseReply(fd(form));
  if (!parsed.ok) return { fieldErrors: { body: parsed.error } };
  if (!hit("noticeReply", String(user.id))) return { error: "err.rateLimited" };
  addReply(post.id, user.id, parsed.value);
  revalidatePath(`/board/${post.id}`);
  return { ok: true };
}

/** The author edits their open notice (e.g. fewer spots left, a new schedule). */
async function updateNoticeActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const post = getNotice(Number(form.get("postId")));
  if (!post || post.author_id !== user.id) return { error: "err.notFound" };
  if (post.status !== "open") return { error: "err.noticeClosed" };
  const parsed = parseNotice(fd(form));
  if (!parsed.ok) return { fieldErrors: parsed.errors, error: "err.fixFields" };
  if (!hit("chat", String(user.id))) return { error: "err.rateLimited" };
  updateNotice(post.id, parsed.value);
  revalidatePath("/", "layout");
  redirect(`/board/${post.id}?edited=1`);
}

/** "Keep it up": the author gives an open (or just expired) notice another 30 days on the board. */
export async function renewNoticeAction(form: FormData) {
  const user = await requireUser();
  const post = getNotice(Number(form.get("postId")));
  if (!post || post.author_id !== user.id || post.status !== "open") throw new Error("Not found");
  renewNotice(post.id);
  await toast("toast.noticeRenewed");
  revalidatePath("/", "layout");
}

export async function closeNoticeAction(form: FormData) {
  const user = await requireUser();
  const post = getNotice(Number(form.get("postId")));
  if (!post || (post.author_id !== user.id && user.role !== "admin")) throw new Error("Not found");
  db().prepare("UPDATE lfg_posts SET status = 'closed' WHERE id = ?").run(post.id);
  await toast("toast.noticeClosed");
  revalidatePath("/", "layout");
}

export async function toggleSaveAction(form: FormData) {
  const gameId = Number(form.get("gameId"));
  const user = await requireUser(`/games/${String(form.get("slug") ?? "")}`);
  if (!getGameById(gameId)) throw new Error("Not found");
  setSaved(user.id, gameId, form.get("save") === "1");
  await toast(form.get("save") === "1" ? "toast.saved" : "toast.unsaved");
  revalidatePath("/", "layout");
}

export async function toggleFollowAction(form: FormData) {
  const gmId = Number(form.get("gmId"));
  const user = await requireUser(`/gms/${gmId}`);
  const gm = db().prepare("SELECT 1 FROM gm_profiles p JOIN users u ON u.id = p.user_id WHERE u.id = ? AND u.deleted_at IS NULL AND u.suspended_at IS NULL").get(gmId);
  if (!gm || gmId === user.id) throw new Error("Not found");
  setFollowing(user.id, gmId, form.get("follow") === "1");
  await toast(form.get("follow") === "1" ? "toast.followed" : "toast.unfollowed");
  revalidatePath("/", "layout");
}

// ─── Questions to the GM (before booking) ────────────────────────────────

function messageBody(form: FormData): { body: string } | { error: MsgKey } {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "err.emptyMessage" };
  if (body.length > 1000) return { error: "err.longMessage" };
  return { body };
}

async function askQuestionActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const game = getGameById(Number(form.get("gameId")));
  const user = await requireUser(game ? `/games/${game.slug}/ask` : undefined);
  if (!game || game.status !== "published") return { error: "err.notFound" };
  if (game.gm_id === user.id) return { error: "err.ownGame" };
  if (!user.email_verified) return { error: "err.verifyEmail" };
  const m = messageBody(form);
  if ("error" in m) return { error: m.error };
  if (!hit("question", String(user.id))) return { error: "err.rateLimited" };
  const id = askQuestion(game.id, game.gm_id, user.id, m.body);
  redirect(`/questions/${id}?sent=1`);
}

async function replyQuestionActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const thread = getQuestionThread(Number(form.get("questionId")));
  if (!thread || (user.id !== thread.player_id && user.id !== thread.gm_id)) return { error: "err.membersOnly" };
  const m = messageBody(form);
  if ("error" in m) return { error: m.error };
  if (!hit("chat", String(user.id))) return { error: "err.rateLimited" };
  replyQuestion(thread, user.id, m.body);
  revalidatePath(`/questions/${thread.id}`);
  return { ok: true };
}

// ─── Feedback ────────────────────────────────────────────────────────────

async function sendFeedbackActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const kind = form.get("kind");
  const body = String(form.get("body") ?? "").trim();
  const email = user ? "" : String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const page = String(form.get("page") ?? "").split("?")[0].slice(0, 200);
  const fieldErrors: FieldErrors = {};
  if (kind !== "bug" && kind !== "idea" && kind !== "other") fieldErrors.kind = "v.feedbackKind";
  if (body.length < 10 || body.length > 2000) fieldErrors.body = "v.feedbackBody";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "v.email";
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "err.fixFields" };
  if (!hit("feedback", user ? String(user.id) : await clientIp())) return { error: "err.rateLimited" };
  tx((c) => {
    c.prepare("INSERT INTO feedback (user_id, email, kind, body, page) VALUES (?, ?, ?, ?, ?)").run(user?.id ?? null, email, String(kind), body, isSafeNext(page) ? page : "");
    const admins = c.prepare("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND suspended_at IS NULL").all() as { id: number }[];
    for (const a of admins) notify({ userId: a.id, kind: "feedback_new", actorId: user?.id ?? null }, c);
  });
  return { ok: true };
}

export async function sendFeedbackAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => sendFeedbackActionImpl(prev, form));
}

export async function markFeedbackDoneAction(form: FormData) {
  await requireAdmin();
  db().prepare("UPDATE feedback SET status = ? WHERE id = ?").run(form.get("done") === "1" ? "done" : "new", Number(form.get("feedbackId")));
  revalidatePath("/admin/feedback");
}

// ─── Reports & moderation ────────────────────────────────────────────────

async function createReportActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseReport(fd(form));
  if (!parsed.ok) return parsed.errors.target ? { error: parsed.errors.target } : { fieldErrors: parsed.errors };
  if (!hit("report", String(user.id))) return { error: "err.rateLimited" };
  const { targetType, targetId, reason, details } = parsed.value;
  const result = createReport(user.id, targetType, targetId, reason, details);
  if (result === "notFound") return { error: "err.notFound" };
  if (result === "own") return { error: "err.reportOwn" };
  if (result === "duplicate") return { error: "err.alreadyReported" };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function decideReportAction(form: FormData) {
  const admin = await requireAdmin();
  const decision = form.get("decision");
  if (!isReportDecision(decision)) throw new Error("Bad decision");
  if (decideReport(Number(form.get("reportId")), admin.id, decision, String(form.get("note") ?? "").trim().slice(0, 500))) await toast("toast.reportDecided");
  revalidatePath("/", "layout");
}

export async function setSuspendedAction(form: FormData) {
  const admin = await requireAdmin();
  const userId = Number(form.get("userId"));
  if (userId === admin.id) throw new Error("Cannot suspend yourself");
  if (form.get("suspend") === "1") { if (suspendUser(userId, admin.id)) logAdminAction(admin.id, "suspend", userId); }
  else if (unsuspendUser(userId)) logAdminAction(admin.id, "unsuspend", userId);
  revalidatePath("/", "layout");
}

export async function setGmVerifiedAction(form: FormData) {
  const admin = await requireAdmin();
  const userId = Number(form.get("userId"));
  const verified = form.get("verified") === "1";
  if (setGmVerified(userId, verified)) logAdminAction(admin.id, verified ? "verify" : "unverify", userId);
  revalidatePath("/", "layout");
}

// ─── Notifications ───────────────────────────────────────────────────────

/** Called when the header popover opens. */
export async function markNotificationsReadAction() {
  const user = await getCurrentUser();
  if (user) markAllRead(user.id);
}

// ─── Exported form actions (echo input back on error) ────────────────────

export async function signupAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => signupActionImpl(prev, form));
}

export async function loginAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => loginActionImpl(prev, form));
}

export async function becomeGmAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => becomeGmActionImpl(prev, form));
}

export async function saveGameAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => saveGameActionImpl(prev, form));
}

export async function addSessionAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => addSessionActionImpl(prev, form));
}

export async function rescheduleSessionAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => rescheduleSessionActionImpl(prev, form));
}

export async function reserveSeatAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => reserveSeatActionImpl(prev, form));
}

export async function postMessageAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => postMessageActionImpl(prev, form));
}

export async function submitReviewAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => submitReviewActionImpl(prev, form));
}

export async function updateReviewAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => updateReviewActionImpl(prev, form));
}

export async function replyReviewAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => replyReviewActionImpl(prev, form));
}

export async function updateProfileAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => updateProfileActionImpl(prev, form));
}

export async function changePasswordAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => changePasswordActionImpl(prev, form));
}

export async function createGmRequestAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => createGmRequestActionImpl(prev, form));
}

export async function sendOfferAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => sendOfferActionImpl(prev, form));
}

export async function requestPasswordResetAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => requestPasswordResetActionImpl(prev, form));
}

export async function resetPasswordAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => resetPasswordActionImpl(prev, form));
}

export async function deleteAccountAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => deleteAccountActionImpl(prev, form));
}

export async function createReportAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => createReportActionImpl(prev, form));
}

export async function createNoticeAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => createNoticeActionImpl(prev, form));
}

export async function updateNoticeAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => updateNoticeActionImpl(prev, form));
}

export async function replyNoticeAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => replyNoticeActionImpl(prev, form));
}

export async function askQuestionAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => askQuestionActionImpl(prev, form));
}

export async function replyQuestionAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => replyQuestionActionImpl(prev, form));
}

export async function postRequestMessageAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => postRequestMessageActionImpl(prev, form));
}
