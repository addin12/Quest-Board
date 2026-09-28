import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, newPage, e2eDb, signup, unique, createGmWithGame, bookFirstOpenSeat } from "./helpers";

test("a GM cancels a session with a message: players see it in the bell, on My games and by email", async ({ page, browser }) => {
  const db = e2eDb();
  const game = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + 40 * 86_400_000).toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(sid, player.id);
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  try {
    await login(page, "gm@questboard.test");
    await page.goto(`/gm/games/${game.id}`);
    const panel = page.locator(`details:has(input[name="sessionId"][value="${sid}"]):has(textarea[name="reason"])`);
    await panel.locator("summary").click();
    await panel.getByLabel("Message to your players (optional)").fill("I'm ill — let's move to next Saturday.");
    page.once("dialog", (d) => d.accept());
    await panel.getByRole("button", { name: "Cancel this session" }).click();
    await expect(page.getByText("Session cancelled", { exact: false }).first()).toBeVisible();

    const status = db.prepare("SELECT status, cancel_reason FROM game_sessions WHERE id = ?").get(sid) as { status: string; cancel_reason: string };
    expect(status).toEqual({ status: "cancelled", cancel_reason: "I'm ill — let's move to next Saturday." });
    const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = 'player@questboard.test' AND subject LIKE 'Cancelled:%'").get(mark) as { subject: string; body_text: string };
    expect(mail.subject).toMatch(/Mercusuar di Pulau Kabut/);
    expect(mail.body_text).toContain("I'm ill — let's move to next Saturday.");

    const p = await newPage(browser);
    await login(p, "player@questboard.test");
    await p.goto("/notifications");
    await expect(p.getByText("I'm ill — let's move to next Saturday.").first()).toBeVisible();
    await p.goto("/dashboard");
    await expect(p.getByText("“I'm ill — let's move to next Saturday.”")).toBeVisible();
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.close();
  }
});

/** A time as the value of a datetime-local input, in this machine's timezone (the test browser's too). */
const localInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

test("a GM changes a session's time: seats stay, players are told, reminders start over", async ({ page, browser }) => {
  const db = e2eDb();
  const game = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  const first = Math.floor((Date.now() + 45 * 86_400_000) / 3_600_000) * 3_600_000; // on the hour
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(first).toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(sid, player.id);
  db.prepare("INSERT INTO session_reminders (session_id, user_id, kind) VALUES (?, ?, '24h')").run(sid, player.id);
  const waiter = db.prepare("SELECT id FROM users WHERE email = 'citra@questboard.test'").get() as { id: number };
  db.prepare("INSERT INTO waitlist (session_id, player_id) VALUES (?, ?)").run(sid, waiter.id);
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  try {
    await login(page, "gm@questboard.test");
    await page.goto(`/gm/games/${game.id}`);
    const panel = page.locator(`details:has(input[name="sessionId"][value="${sid}"]):has(input[name="startsAt"])`);
    await panel.getByText("Change time").click();
    const when = panel.getByLabel("New date & time");
    await expect(when).toHaveValue(localInput(first)); // starts at the current time, in the GM's timezone
    await expect(panel.getByText("The 1 booked player keeps their seat")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include(`#move-${sid}-at`).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);

    // Same time, or a time in the past: nothing changes.
    await panel.getByRole("button", { name: "Save new time" }).click();
    await expect(panel.getByText("That's already the session's time")).toBeVisible();
    await expect(when).toHaveAttribute("aria-invalid", "true");
    await when.fill(localInput(Date.now() - 86_400_000));
    await panel.getByRole("button", { name: "Save new time" }).click();
    await expect(panel.getByText("Sessions must be scheduled in the future.")).toBeVisible();

    const moved = first + 86_400_000 + 30 * 60_000; // the next day, half an hour later
    await when.fill(localInput(moved));
    await panel.getByLabel("Length").selectOption("240");
    await panel.getByRole("button", { name: "Save new time" }).click();
    await expect(page.getByText("Time changed. Booked players have been told.")).toBeVisible();

    const row = db.prepare("SELECT starts_at, duration_minutes, reschedule_count, status FROM game_sessions WHERE id = ?").get(sid);
    expect(row).toEqual({ starts_at: new Date(moved).toISOString(), duration_minutes: 240, reschedule_count: 1, status: "scheduled" });
    expect(db.prepare("SELECT status FROM bookings WHERE session_id = ?").get(sid)).toEqual({ status: "confirmed" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM session_reminders WHERE session_id = ?").get(sid) as { n: number }).n).toBe(0);
    // Someone on the waitlist hears about the new time too.
    expect(db.prepare("SELECT 1 AS ok FROM notifications WHERE user_id = ? AND kind = 'waitlist_session_moved' AND session_id = ?").get(waiter.id, sid)).toEqual({ ok: 1 });
    const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = 'player@questboard.test' AND subject LIKE 'New time:%'").get(mark) as { subject: string; body_text: string };
    expect(mail.subject).toMatch(/Mercusuar di Pulau Kabut/);
    expect(mail.body_text).toMatch(/Was: .+\nNow: .+ \(4 hours\)/);

    const p = await newPage(browser);
    await login(p, "player@questboard.test");
    await p.goto("/notifications");
    await expect(p.getByText("The GM changed the time of a session of Mercusuar di Pulau Kabut that you booked").first()).toBeVisible();
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.close();
  }
});

test("if the GM changes the time or price while a player is on the booking page, the player is asked again", async ({ page }) => {
  const db = e2eDb();
  const game = db.prepare("SELECT id, price_idr FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number; price_idr: number };
  const at = new Date(Date.now() + 47 * 86_400_000).toISOString();
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, at).lastInsertRowid);
  try {
    await signup(page, "Careful Player", unique("stale"));
    await page.goto(`/book/${sid}`);
    const later = new Date(Date.parse(at) + 86_400_000).toISOString();
    db.prepare("UPDATE game_sessions SET starts_at = ? WHERE id = ?").run(later, sid); // the GM moves it meanwhile
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Reserve my seat" }).click();
    await expect(page.getByText("The GM just changed this session's time or price.")).toBeVisible();
    expect((db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE session_id = ?").get(sid) as { n: number }).n).toBe(0);
    // The page now shows the new time; confirming again books it.
    await expect(page.locator('input[name="seenStartsAt"]')).toHaveValue(later);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Reserve my seat" }).click();
    await page.waitForURL("**/dashboard?booked=*");
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.close();
  }
});

test("editing a published game: the address stays, it can't be unpublished under booked players, and a new place is announced", async ({ page, browser }) => {
  const title = `Stable Table ${Date.now() % 100000}`;
  const slug = await createGmWithGame(page, "Stable GM", unique("stable-gm"), title);
  const manage = page.url();
  const player = await newPage(browser);
  await signup(player, "Seat Holder", unique("holder"));
  await bookFirstOpenSeat(player, [slug]);

  await page.goto(`${manage}/edit`);
  await page.getByLabel("Title").fill(`${title} Renamed`);
  await page.getByLabel("Visibility").selectOption("draft");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Players hold seats in upcoming sessions.")).toBeVisible();
  await expect(page.getByLabel("Visibility")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Visibility").selectOption("published");
  await page.getByLabel("Platform(s)").fill("Discord + Owlbear Rodeo");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);

  // Renamed, but the shared link still works.
  await player.goto(`/games/${slug}`);
  await expect(player.getByRole("heading", { level: 1, name: `${title} Renamed` })).toBeVisible();
  // The booked player hears that the table moved to another platform.
  await player.goto("/notifications");
  await expect(player.getByText(`The GM changed where ${title} Renamed is played`)).toBeVisible();
});

test("a GM replies to a review: everyone sees it, the reviewer is told, and the GM can take it back", async ({ page, browser }) => {
  const db = e2eDb();
  const review = db.prepare(
    "SELECT r.id, u.email FROM reviews r JOIN games g ON g.id = r.game_id JOIN users u ON u.id = r.player_id WHERE g.slug = 'mercusuar-di-pulau-kabut' AND r.gm_reply = '' AND u.deleted_at IS NULL ORDER BY r.id LIMIT 1",
  ).get() as { id: number; email: string };
  const reply = `Thank you for playing! ${Date.now() % 100000}`;
  try {
    await login(page, "gm@questboard.test");
    await page.goto("/games/mercusuar-di-pulau-kabut");
    const item = page.getByRole("region", { name: /Reviews/ }).getByRole("listitem").filter({ has: page.locator(`input[name="reviewId"][value="${review.id}"]`) });
    await item.getByText("Reply as the GM").click();
    const { violations } = await new AxeBuilder({ page }).include(`#reply-${review.id}`).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await item.getByLabel("Your public reply").fill(reply);
    await item.getByRole("button", { name: "Save reply" }).click();
    await expect(page.getByText("Your reply is up.")).toBeVisible();

    const visitor = await newPage(browser);
    await visitor.goto("/games/mercusuar-di-pulau-kabut");
    await expect(visitor.getByText("Reply from Raka Pradipta (GM)").first()).toBeVisible();
    await expect(visitor.getByText(reply)).toBeVisible();
    await expect(visitor.getByText("Reply as the GM")).toHaveCount(0); // only the game's GM can answer

    const reviewer = await newPage(browser);
    await login(reviewer, review.email);
    await reviewer.goto("/notifications");
    await expect(reviewer.getByText("Raka Pradipta replied to your review of Mercusuar di Pulau Kabut").first()).toBeVisible();

    // Emptying the reply removes it.
    await page.reload();
    await item.getByText("Edit your reply").click();
    await item.getByLabel("Your public reply").fill("");
    await item.getByRole("button", { name: "Save reply" }).click();
    await expect(page.getByText("Your reply was removed.")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText(reply)).toHaveCount(0);
  } finally {
    db.prepare("UPDATE reviews SET gm_reply = '', gm_replied_at = NULL WHERE id = ?").run(review.id);
    db.close();
  }
});

test("a GM removes one player: the seat goes to the waitlist, the player is told and can't rebook", async ({ page, browser }) => {
  const db = e2eDb();
  const game = db.prepare("SELECT id, seats_total FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number; seats_total: number };
  const id = (email: string) => (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  const player = id("player@questboard.test");
  const waiter = id("citra@questboard.test");
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + 48 * 86_400_000).toISOString()).lastInsertRowid);
  // Full session: the demo player plus fillers; Citra waits for a seat.
  const fillers = (db.prepare("SELECT id FROM users WHERE email NOT IN ('player@questboard.test', 'citra@questboard.test', 'gm@questboard.test') AND role = 'player' AND deleted_at IS NULL LIMIT ?").all(game.seats_total - 1) as { id: number }[]).map((u) => u.id);
  for (const u of [player, ...fillers]) db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(sid, u);
  db.prepare("INSERT INTO waitlist (session_id, player_id) VALUES (?, ?)").run(sid, waiter);
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  try {
    await login(page, "gm@questboard.test");
    await page.goto(`/gm/games/${game.id}`);
    const card = page.locator(".card", { has: page.locator(`select#remove-${sid}`) });
    await card.getByText("Remove a player").click();
    await card.getByLabel("Player", { exact: true }).selectOption({ label: "Andi Wijaya" });
    await card.getByLabel("Message to the player (optional)").fill("Sorry — this table is for the campaign's regulars.");
    page.once("dialog", (d) => void d.accept());
    await card.getByRole("button", { name: "Remove from this session" }).click();
    await expect(page.getByText("The player was removed and told.", { exact: false })).toBeVisible();

    expect(db.prepare("SELECT status, cancelled_by FROM bookings WHERE session_id = ? AND player_id = ?").get(sid, player)).toEqual({ status: "cancelled", cancelled_by: "gm" });
    expect(db.prepare("SELECT status FROM waitlist WHERE session_id = ? AND player_id = ?").get(sid, waiter)).toEqual({ status: "offered" }); // the freed seat is offered
    const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = 'player@questboard.test' AND subject LIKE 'Your seat was released:%'").get(mark) as { subject: string; body_text: string };
    expect(mail.body_text).toContain("Sorry — this table is for the campaign's regulars.");

    const p = await newPage(browser);
    await login(p, "player@questboard.test");
    await p.goto("/notifications");
    await expect(p.getByText("The GM released your seat in a session of Mercusuar di Pulau Kabut").first()).toBeVisible();
    await p.goto("/games/mercusuar-di-pulau-kabut");
    await expect(p.getByText("Seat released by the GM")).toBeVisible();
    await p.goto(`/book/${sid}`);
    await expect(p.getByText("The GM released your seat in this session, so you can't book it again.")).toBeVisible();
    await expect(p.getByRole("button", { name: "Reserve my seat" })).toHaveCount(0);
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.close();
  }
});

test("a GM duplicates a game: a draft copy without sessions, ready to edit", async ({ page }) => {
  await login(page, "gm@questboard.test");
  const db = e2eDb();
  const game = db.prepare("SELECT id, title FROM games WHERE slug = 'signal-from-tartarus-station'").get() as { id: number; title: string };
  await page.goto(`/gm/games/${game.id}`);
  await page.getByRole("button", { name: "Duplicate game" }).click();
  await expect(page).toHaveURL(/\/gm\/games\/\d+\/edit$/);
  await expect(page.getByLabel("Title")).toHaveValue(`${game.title} (copy)`);
  const copyId = Number(page.url().match(/games\/(\d+)\/edit/)![1]);
  const copy = db.prepare("SELECT status, system, summary, (SELECT COUNT(*) FROM game_sessions WHERE game_id = games.id) AS sessions FROM games WHERE id = ?").get(copyId) as { status: string; sessions: number; system: string; summary: string };
  const orig = db.prepare("SELECT system, summary FROM games WHERE id = ?").get(game.id) as { system: string; summary: string };
  expect(copy.status).toBe("draft");
  expect(copy.sessions).toBe(0);
  expect({ system: copy.system, summary: copy.summary }).toEqual(orig);
  // A draft isn't public.
  const slug = (db.prepare("SELECT slug FROM games WHERE id = ?").get(copyId) as { slug: string }).slug;
  expect((await page.request.get(`/api/games/${slug}`)).status()).toBe(404);
  db.prepare("DELETE FROM games WHERE id = ?").run(copyId);
  db.close();
});
