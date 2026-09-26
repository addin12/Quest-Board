"use server";

import { cookies, headers } from "next/headers";
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
import { canReview, getGameById, getGmRequest, getGmSettings, getSessionWithGame, isGameMember, maxSeatsTakenUpcoming } from "@/lib/queries";
import { LANG_COOKIE, type MsgKey } from "@/lib/i18n/dict";
import { markAllRead, notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/mailer";
import { consumeToken, issueToken, peekToken } from "@/lib/tokens";
import { archiveGame, deleteAccount } from "@/lib/account";
import { createReport, decideReport, setGmVerified, suspendUser, unsuspendUser } from "@/lib/moderation";
import { isReportDecision, parseReport } from "@/lib/reports";
import { heldSeats, joinWaitlist, leaveWaitlist, processWaitlist } from "@/lib/waitlist";
import { addReply, announceGameIfNew, createNotice, getNotice, setFollowing, setSaved } from "@/lib/community";
import { parseNotice, parseReply } from "@/lib/board";
import { toast } from "@/lib/toast";
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

  const exists = db().prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) return { fieldErrors: { email: "v.emailTaken" } };

  let userId: number;
  try {
    userId = tx((c) => {
      const id = Number(
        c
          .prepare("INSERT INTO users (email, password_hash, name, role, avatar_hue) VALUES (?, ?, ?, ?, ?)")
          .run(email, hashPassword(password), name, role, Math.floor(Math.random() * 360)).lastInsertRowid,
      );
      if (role === "gm") c.prepare("INSERT INTO gm_profiles (user_id) VALUES (?)").run(id);
      return id;
    });
  } catch (err) {
    // Two sign-ups with the same email at the same moment: the second hits the UNIQUE index.
    if (isUniqueViolation(err)) return { fieldErrors: { email: "v.emailTaken" } };
    throw err;
  }
  await createSession(userId);
  await sendVerificationEmail(userId, email, name);
  redirect(role === "gm" ? "/gm" : safeNext(form.get("next")));
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

  tx((c) => {
    c.prepare("UPDATE users SET bio = ?, avatar_image = ?, role = CASE WHEN role = 'admin' THEN role ELSE 'gm' END WHERE id = ?").run(bio, avatarImage, user.id);
    c.prepare(
      `INSERT INTO gm_profiles (user_id, headline, systems, years_experience, location, payment_info) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET headline = excluded.headline, systems = excluded.systems,
         years_experience = excluded.years_experience, location = excluded.location, payment_info = excluded.payment_info`,
    ).run(user.id, headline, systems, years, location, paymentInfo);
  });
  if (user.role === "player") await rotateSession(user.id); // role changed: issue a fresh session token
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
    if (g.seatsTotal < maxSeatsTakenUpcoming(idRaw)) {
      return { fieldErrors: { seatsTotal: "v.seatsBelowBooked" }, error: "err.fixFields" };
    }
    db()
      .prepare(
        `UPDATE games SET slug = ?, title = ?, system = ?, summary = ?, description = ?, format = ?, location_type = ?, language = ?, platform = ?, city = ?,
           price_idr = ?, seats_total = ?, experience_level = ?, min_age = ?, content_warnings = ?, safety_tools = ?, tags = ?, cover_hue = ?, cover_image = ?, genres = ?, styles = ?, status = ?
         WHERE id = ?`,
      )
      .run(
        uniqueSlug(g.title, idRaw), g.title, g.system, g.summary, g.description, g.format, g.locationType, g.language, g.platform, g.city,
        g.priceIdr, g.seatsTotal, g.experienceLevel, g.minAge, g.contentWarnings, g.safetyTools, g.tags, hue, coverImage, genres, styles, g.status, idRaw,
      );
    gameId = idRaw;
    // More seats (or re-publishing) may free places for people on the waitlist.
    const upcomingIds = db().prepare("SELECT id FROM game_sessions WHERE game_id = ? AND status = 'scheduled' AND starts_at > ?").all(idRaw, new Date().toISOString()) as { id: number }[];
    tx((c) => { for (const u of upcomingIds) processWaitlist(c, u.id); });
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
  tx((c) => {
    const booked = c.prepare("SELECT player_id FROM bookings WHERE session_id = ? AND status = 'confirmed'").all(sessionId) as { player_id: number }[];
    for (const b of booked) notify({ userId: b.player_id, kind: "session_cancelled", actorId: s.gm_id, sessionId }, c);
    c.prepare("UPDATE game_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
    c.prepare("UPDATE waitlist SET status = 'expired' WHERE session_id = ? AND status IN ('waiting','offered')").run(sessionId);
    c.prepare(
      "UPDATE bookings SET status = 'cancelled', cancelled_by = 'gm', cancelled_at = ? WHERE session_id = ? AND status = 'confirmed'",
    ).run(new Date().toISOString(), sessionId);
  });
  await toast("toast.sessionCancelled");
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
    });
    if (!verdict.ok) return verdict.reason;
    c.prepare("INSERT INTO bookings (session_id, player_id, status, price_idr) VALUES (?, ?, 'confirmed', ?)").run(
      sessionId, user.id, s.price_idr,
    );
    notify({ userId: s.gm_id, kind: "booking_new", actorId: user.id, sessionId }, c);
    c.prepare("UPDATE waitlist SET status = 'claimed' WHERE session_id = ? AND player_id = ? AND status IN ('waiting','offered')").run(sessionId, user.id);
    return null;
  });
  if (bookingError) return { error: bookingError };

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

// ─── Profile settings (players & GMs) ────────────────────────────────────

async function updateProfileActionImpl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/settings");
  const parsed = parseProfile(fd(form));
  const avatarImage = String(form.get("avatarImage") ?? "");
  const fieldErrors: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
  if (!isAllowedPortrait(avatarImage, user.avatar_image)) fieldErrors.avatarImage = "v.portrait";
  if (parsed.ok && (user.role === "gm" || user.role === "admin") && parsed.value.bio.length < 30) fieldErrors.bio = "v.bio";
  if (!parsed.ok || Object.keys(fieldErrors).length) return { fieldErrors, error: "err.fixFields" };
  db().prepare("UPDATE users SET name = ?, bio = ?, avatar_image = ?, email_reminders = ? WHERE id = ?")
    .run(parsed.value.name, parsed.value.bio, avatarImage, form.get("emailReminders") === "1" ? 1 : 0, user.id);
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
  return { ok: true };
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
    await toast("toast.gmChosen");
  }
  revalidatePath("/", "layout");
}

export async function closeRequestAction(form: FormData) {
  const user = await requireUser();
  const request = getGmRequest(Number(form.get("requestId")));
  if (!request || request.requester_id !== user.id) throw new Error("Not found");
  // Only open requests can be closed: a matched request keeps its thread and payment details.
  db().prepare("UPDATE gm_requests SET status = 'closed' WHERE id = ? AND status = 'open'").run(request.id);
  await toast("toast.requestClosed");
  revalidatePath("/", "layout");
}

// ─── Email verification, password reset, account deletion ───────────────

async function sendVerificationEmail(userId: number, email: string, name: string) {
  const { t } = await getI18n();
  const link = `${await siteOrigin()}/verify-email?token=${issueToken(userId, "verify")}`;
  await sendEmail({ to: email, subject: t("mail.verifySubject"), text: t("mail.verifyBody", { name, link }) });
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
    await sendEmail({ to: email, subject: t("mail.resetSubject"), text: t("mail.resetBody", { name: user.name, link }) });
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
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}

// ─── Waitlist & payments ─────────────────────────────────────────────────

export async function joinWaitlistAction(form: FormData) {
  const sessionId = Number(form.get("sessionId"));
  const user = await requireUser(`/games/${String(form.get("slug") ?? "")}`);
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
  if (form.get("suspend") === "1") suspendUser(userId, admin.id);
  else unsuspendUser(userId);
  revalidatePath("/", "layout");
}

export async function setGmVerifiedAction(form: FormData) {
  await requireAdmin();
  setGmVerified(Number(form.get("userId")), form.get("verified") === "1");
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

export async function reserveSeatAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => reserveSeatActionImpl(prev, form));
}

export async function postMessageAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => postMessageActionImpl(prev, form));
}

export async function submitReviewAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => submitReviewActionImpl(prev, form));
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

export async function replyNoticeAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => replyNoticeActionImpl(prev, form));
}

export async function postRequestMessageAction(prev: FormState, form: FormData): Promise<FormState> {
  return withEcho(form, () => postRequestMessageActionImpl(prev, form));
}
