import { test, expect, type Page, type Locator } from "@playwright/test";
import { e2eDb, login, newPage } from "./helpers";

// Security: every form carries ids in hidden fields. Someone who edits them in the browser to point at
// another person's booking, session, review, notice, request or game must change nothing.
test.describe.configure({ timeout: 180_000 });

/** Point a form field at another id, as someone editing the page in their browser would. */
async function tamper(field: Locator, value: number) {
  await field.evaluate((el, v) => {
    if (el instanceof HTMLSelectElement) {
      const o = document.createElement("option");
      o.value = String(v);
      el.appendChild(o);
    }
    (el as HTMLInputElement).value = String(v);
  }, value);
}

const accept = (page: Page) => page.once("dialog", (d) => void d.accept());
const settle = (page: Page) => page.waitForLoadState("networkidle").catch(() => {});
const SOON = () => new Date(Date.now() + 60 * 86_400_000).toISOString();

test("hidden-field tampering can't touch other people's bookings, sessions, reviews, notices, requests or games", async ({ browser }) => {
  const db = e2eDb();
  db.exec("PRAGMA foreign_keys = ON");
  const uid = (email: string) => (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  const [raka, dewi, andi, citra] = ["gm@questboard.test", "dewi@questboard.test", "player@questboard.test", "citra@questboard.test"].map(uid);
  const tag = `perm${Date.now() % 100000}`;
  const cols = (db.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name).filter((c) => !["id", "slug", "title", "gm_id", "status", "price_idr"].includes(c));
  const copyGame = (slug: string, title: string, gm: number, status = "published") => Number(db.prepare(
    `INSERT INTO games (slug, title, gm_id, status, price_idr, ${cols.join(", ")}) SELECT ?, ?, ?, ?, 50000, ${cols.join(", ")} FROM games WHERE slug = 'mercusuar-di-pulau-kabut'`,
  ).run(slug, title, gm, status).lastInsertRowid);
  const session = (game: number) => Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game, SOON()).lastInsertRowid);
  const book = (s: number, p: number) => Number(db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 50000)").run(s, p).lastInsertRowid);

  // The victim: Raka's game, with Andi booked, reviewed, and asking for a GM.
  const victimGame = copyGame(`${tag}-victim`, `Victim Table ${tag}`, raka);
  const victimSession = session(victimGame);
  const victimBooking = book(victimSession, andi);
  const victimReview = Number(db.prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, 5, 'Andi loved it')").run(victimGame, andi).lastInsertRowid);
  const victimNotice = Number(db.prepare("INSERT INTO lfg_posts (author_id, kind, title, schedule, body, expires_at) VALUES (?, 'lf_group', 'Andi looks for a group', 'Fridays', 'A friendly Friday group, please, online is fine.', ?)").run(andi, new Date(Date.now() + 2 * 86_400_000).toISOString()).lastInsertRowid);
  const victimRequest = Number(db.prepare("INSERT INTO gm_requests (requester_id, title, system, group_size, schedule, details) VALUES (?, 'Andi wants a GM', 'D&D 5e (2014)', 4, 'Fridays', 'Four friends looking for a long campaign together.')").run(andi).lastInsertRowid);
  db.prepare("INSERT INTO gm_request_offers (request_id, gm_id, message, price_idr) VALUES (?, ?, 'Happy to!', 50000)").run(victimRequest, raka);

  // The attackers' own things, so the forms appear: Dewi's game with Citra booked and reviewing; Citra's notice and request.
  const dewiGame = copyGame(`${tag}-dewi`, `Dewi Table ${tag}`, dewi);
  const dewiSession = session(dewiGame);
  book(dewiSession, citra);
  db.prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, 4, 'Citra had fun')").run(dewiGame, citra);
  const archived = copyGame(`${tag}-gone`, `Removed Table ${tag}`, dewi, "archived");
  const citraNotice = Number(db.prepare("INSERT INTO lfg_posts (author_id, kind, title, schedule, body, expires_at) VALUES (?, 'lf_group', 'Citra looks for a group', 'Sundays', 'A relaxed Sunday group, beginners are welcome here.', ?)").run(citra, new Date(Date.now() + 2 * 86_400_000).toISOString()).lastInsertRowid);
  const citraRequest = Number(db.prepare("INSERT INTO gm_requests (requester_id, title, system, group_size, schedule, details) VALUES (?, 'Citra wants a GM', 'D&D 5e (2014)', 3, 'Sundays', 'Three friends looking for a short adventure.')").run(citra).lastInsertRowid);
  db.prepare("INSERT INTO gm_request_offers (request_id, gm_id, message, price_idr) VALUES (?, ?, 'Count me in', 50000)").run(citraRequest, dewi);

  const snapshot = () => ({
    booking: db.prepare("SELECT status, paid_marked_at FROM bookings WHERE id = ?").get(victimBooking),
    session: db.prepare("SELECT status, starts_at, duration_minutes FROM game_sessions WHERE id = ?").get(victimSession),
    review: db.prepare("SELECT rating, body, gm_reply FROM reviews WHERE id = ?").get(victimReview),
    notice: db.prepare("SELECT title, status, expires_at FROM lfg_posts WHERE id = ?").get(victimNotice),
    request: db.prepare("SELECT status, matched_gm_id FROM gm_requests WHERE id = ?").get(victimRequest),
    game: db.prepare("SELECT title, status FROM games WHERE id = ?").get(victimGame),
    archived: db.prepare("SELECT status FROM games WHERE id = ?").get(archived),
  });
  const before = JSON.stringify(snapshot());
  try {
    // ── Dewi (another GM) aims her own forms at Raka's game.
    const gm = await newPage(browser);
    await login(gm, "dewi@questboard.test");
    const manage = `/gm/games/${dewiGame}`;
    const card = () => gm.locator(".card", { has: gm.locator(`select#remove-${dewiSession}`) });

    await gm.goto(manage);
    await card().getByText("Remove a player").click();
    await tamper(card().locator('select[name="bookingId"]'), victimBooking);
    accept(gm);
    await card().getByRole("button", { name: "Remove from this session" }).click();
    await settle(gm);

    await gm.goto(manage);
    await tamper(card().locator('form:has(button[aria-pressed]) input[name="bookingId"]'), victimBooking);
    await card().getByRole("button", { name: /Mark .* seat as paid/ }).click();
    await settle(gm);

    await gm.goto(manage);
    const cancel = card().locator("details", { has: gm.locator("summary", { hasText: "Cancel session" }) });
    await cancel.locator("summary").click();
    await tamper(cancel.locator('input[name="sessionId"]'), victimSession);
    accept(gm);
    await cancel.getByRole("button", { name: "Cancel this session" }).click();
    await settle(gm);

    await gm.goto(manage);
    await card().getByText("Change time").click();
    const move = card().locator("form", { has: gm.locator('input[name="startsAt"]') });
    await tamper(move.locator('input[name="sessionId"]'), victimSession);
    await move.locator('input[name="startsAt"]').fill("2030-01-05T19:00");
    await move.getByRole("button", { name: "Save new time" }).click();
    await settle(gm);

    await gm.goto(`/games/${tag}-dewi`);
    const reply = gm.getByRole("region", { name: /Reviews/ }).locator("form", { has: gm.locator('textarea[name="reply"]') });
    await gm.getByText("Reply as the GM").first().click();
    await tamper(reply.locator('input[name="reviewId"]'), victimReview);
    await reply.locator('textarea[name="reply"]').fill("Hijacked reply");
    await reply.getByRole("button", { name: "Save reply" }).click();
    await settle(gm);

    await gm.goto(`${manage}/edit`);
    await tamper(gm.locator('form input[name="id"]'), victimGame);
    await gm.getByLabel("Title").fill("Hijacked title");
    await gm.getByRole("button", { name: "Save changes" }).click();
    await settle(gm);
    // An archived (e.g. moderator-removed) game can't be reopened for editing or re-published.
    expect((await gm.goto(`/gm/games/${archived}/edit`))?.status()).toBe(404);
    expect((await gm.goto(`/gm/games/${archived}`))?.status()).toBe(404);
    await gm.goto(`${manage}/edit`);
    await tamper(gm.locator('form input[name="id"]'), archived);
    await gm.getByRole("button", { name: "Save changes" }).click();
    await settle(gm);

    // ── Citra (a player) aims her own forms at Andi's things.
    const p = await newPage(browser);
    await login(p, "citra@questboard.test");
    await p.goto(`/games/${tag}-dewi`);
    const mine = p.getByRole("region", { name: /Reviews/ }).getByRole("listitem").filter({ hasText: "Citra had fun" });
    await mine.getByText("Edit your review").click();
    await tamper(mine.locator('form:has(textarea[name="body"]) input[name="reviewId"]'), victimReview);
    await mine.getByRole("textbox", { name: "Review" }).fill("Hijacked review");
    await mine.getByRole("button", { name: "Save changes" }).click();
    await settle(p);

    await p.goto(`/games/${tag}-dewi`);
    await mine.getByText("Edit your review").click();
    await tamper(mine.locator('form:has(button:text("Delete review")) input[name="reviewId"]'), victimReview);
    accept(p);
    await mine.getByRole("button", { name: "Delete review" }).click();
    await settle(p);

    await p.goto(`/board/${citraNotice}/edit`);
    await tamper(p.locator('form input[name="postId"]'), victimNotice);
    await p.getByLabel("Headline").fill("Hijacked notice");
    await p.getByRole("button", { name: "Save changes" }).click();
    await settle(p);
    await p.goto(`/board/${citraNotice}`);
    await tamper(p.locator('form:has(button:text("Keep it up")) input[name="postId"]'), victimNotice);
    await p.getByRole("button", { name: /Keep it up/ }).click();
    await settle(p);
    await p.goto(`/board/${citraNotice}`);
    await tamper(p.locator('form:has(button:text("Take it down")) input[name="postId"]'), victimNotice);
    accept(p);
    await p.getByRole("button", { name: "Take it down" }).click();
    await settle(p);
    expect((await p.goto(`/board/${victimNotice}/edit`))?.status()).toBe(404);

    await p.goto("/dashboard");
    const row = p.locator(".card", { has: p.getByRole("link", { name: `Dewi Table ${tag}` }) }).first();
    await tamper(row.locator('input[name="bookingId"]'), victimBooking);
    accept(p);
    await row.getByRole("button", { name: "Cancel" }).click();
    await settle(p);

    await p.goto(`/hire-a-gm/requests/${citraRequest}`);
    await tamper(p.locator('form:has(button:text("Choose this GM")) input[name="requestId"]'), victimRequest);
    await p.locator('form:has(button:text("Choose this GM")) input[name="gmId"]').evaluate((el, v) => { (el as HTMLInputElement).value = String(v); }, raka);
    await p.getByRole("button", { name: "Choose this GM" }).click();
    await settle(p);
    expect((await p.goto(`/hire-a-gm/requests/${victimRequest}`))?.status()).toBe(404); // not hers to see

    expect(JSON.stringify(snapshot())).toBe(before);
  } finally {
    db.prepare("DELETE FROM games WHERE slug LIKE ?").run(`${tag}-%`);
    db.prepare("DELETE FROM lfg_posts WHERE id IN (?, ?)").run(victimNotice, citraNotice);
    db.prepare("DELETE FROM gm_requests WHERE id IN (?, ?)").run(victimRequest, citraRequest);
    db.close();
  }
});

test("private files and pages answer 404 to everyone else", async ({ page, request }) => {
  const db = e2eDb();
  const raka = db.prepare("SELECT g.id FROM games g JOIN users u ON u.id = g.gm_id WHERE u.email = 'gm@questboard.test' AND g.status = 'published' LIMIT 1").get() as { id: number };
  db.close();
  // Signed out.
  for (const path of [`/api/gm/games/${raka.id}/roster`, "/api/me/export", "/api/gm/earnings"]) {
    expect((await request.get(path)).status(), path).toBeGreaterThanOrEqual(401);
  }
  // Another GM.
  await login(page, "dewi@questboard.test");
  expect((await page.request.get(`/api/gm/games/${raka.id}/roster`)).status()).toBe(404);
  expect((await page.goto(`/gm/games/${raka.id}`))?.status()).toBe(404);
  expect((await page.goto(`/gm/games/${raka.id}/edit`))?.status()).toBe(404);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});
