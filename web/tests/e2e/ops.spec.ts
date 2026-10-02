import { test, expect } from "@playwright/test";
import { confirmLink, login, newPage, e2eDb } from "./helpers";

test("health check: 200 with the schema version, nothing private", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(typeof body.schema).toBe("number");
  expect(Object.keys(body).sort()).toEqual(["ok", "schema"]);
});

test("full health check for uptime monitors: 503 until the cron has run recently, then 200", async ({ request }) => {
  const db = e2eDb();
  db.prepare("DELETE FROM app_state WHERE key = 'cron_last_run'").run();
  let res = await request.get("/api/health?full=1");
  expect(res.status()).toBe(503); // the cron is configured on this server but hasn't run
  expect((await res.json()).cron).toEqual({ ok: false, lastRun: null });
  db.prepare("INSERT INTO app_state (key, value) VALUES ('cron_last_run', ?)").run(new Date(Date.now() - 45 * 60_000).toISOString());
  expect((await request.get("/api/health?full=1")).status()).toBe(503); // 45 minutes ago: stale
  db.close();
  const cron = await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer e2e-cron-secret" } });
  expect(cron.status()).toBe(200);
  res = await request.get("/api/health?full=1");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.cron.ok).toBe(true);
  expect(body.email).toBe("not configured"); // no email provider on the e2e servers
  expect((await request.get("/api/health")).status()).toBe(200); // liveness doesn't depend on the cron
});

test("server errors are logged and shown to admins; the launch pulse is on the admin home", async ({ page, browser }) => {
  const db = e2eDb();
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM error_log").get() as { n: number }).n;
  const mine = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const other = db.prepare("SELECT id FROM games WHERE slug = 'naga-naga-hutan-bara-petualangan-pemula'").get() as { id: number };

  // A GM tampers with the archive form to target someone else's game: the server refuses (throws).
  await login(page, "gm@questboard.test");
  await page.goto(`/gm/games/${mine.id}`);
  await page.locator('form:has(input[name="gameId"]) input[name="gameId"]').last().evaluate((el, id) => ((el as HTMLInputElement).value = String(id)), other.id);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect.poll(() => (db.prepare("SELECT COUNT(*) AS n FROM error_log WHERE id > ?").get(mark) as { n: number }).n, { timeout: 10_000 }).toBeGreaterThan(0);
  const logged = db.prepare("SELECT message, path, route_type FROM error_log WHERE id > ? ORDER BY id DESC").get(mark) as { message: string; path: string; route_type: string };
  expect(logged.message).toContain("Not found");
  expect(logged.route_type).toBe("action");
  expect(logged.path).not.toContain("?");
  expect((db.prepare("SELECT status FROM games WHERE id = ?").get(other.id) as { status: string }).status).toBe("published"); // untouched

  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Launch pulse" })).toBeVisible();
  await expect(admin.getByText(/server errors? this week/)).toBeVisible();
  await admin.getByRole("link", { name: "Server errors" }).first().click();
  await expect(admin.getByText(logged.message).first()).toBeVisible();
  // Non-admins can't see the log.
  expect((await page.goto("/admin/errors"))?.status()).toBe(404);
  db.close();
});

test("admins can read a question thread but don't get a reply box", async ({ page }) => {
  const db = e2eDb();
  db.exec("PRAGMA foreign_keys = ON");
  const game = db.prepare("SELECT id FROM games WHERE slug = 'signal-from-tartarus-station'").get() as { id: number };
  const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@questboard.test'").get() as { id: number };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  db.prepare("DELETE FROM game_questions WHERE game_id = ? AND player_id = ?").run(game.id, player.id);
  const qid = Number(db.prepare("INSERT INTO game_questions (game_id, player_id) VALUES (?, ?)").run(game.id, player.id).lastInsertRowid);
  db.prepare("INSERT INTO game_question_messages (question_id, user_id, body) VALUES (?, ?, 'A question for the GM')").run(qid, player.id);
  try {
    await login(page, "admin@questboard.test");
    await page.goto(`/questions/${qid}`);
    await expect(page.getByText("A question for the GM")).toBeVisible();
    await expect(page.getByPlaceholder("Write a reply…")).toHaveCount(0);
    expect(admin.id).toBeGreaterThan(0);
  } finally {
    db.prepare("DELETE FROM game_questions WHERE id = ?").run(qid);
    db.close();
  }
});

test("the setup check names what isn't production-ready, and the admin home says so", async ({ page }) => {
  await login(page, "admin@questboard.test");
  await page.goto("/admin");
  await expect(page.getByText(/setup problems? needs? fixing before real users arrive/)).toBeVisible();
  await page.getByRole("link", { name: "See the setup check" }).click();
  await expect(page).toHaveURL(/\/admin\/setup$/);
  const check = (title: string) => page.getByTestId("setup-check").filter({ hasText: title });
  // These e2e servers run with test-only switches, demo data and no email provider.
  await expect(check("Test-only switches")).toHaveAttribute("data-level", "danger");
  await expect(check("Test-only switches")).toContainText("QUESTBOARD_DEV_OUTBOX");
  await expect(check("Demo data")).toHaveAttribute("data-level", "danger");
  await expect(check("Email provider")).toHaveAttribute("data-level", "danger");
  await expect(page.getByTestId("setup-check").first()).toHaveAttribute("data-level", "danger"); // problems first
});

test("script-policy reports from browsers show in Admin → Server errors; extension noise doesn't", async ({ page, request, baseURL }) => {
  const report = (blocked: string) => request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({ "csp-report": { "document-uri": `${baseURL}/games?x=1`, "effective-directive": "script-src-elem", "blocked-uri": blocked } }),
  });
  expect((await report("https://cdn.blocked-in-e2e.example/lib.js")).status()).toBe(204);
  expect((await report("chrome-extension://abcdef/inject.js")).status()).toBe(204);
  expect((await page.request.get("/")).headers()["content-security-policy"]).toContain("report-uri /api/csp-report");
  await login(page, "admin@questboard.test");
  await page.goto("/admin/errors");
  await expect(page.getByText("Content Security Policy blocked script-src-elem: https://cdn.blocked-in-e2e.example").first()).toBeVisible();
  await expect(page.getByText("chrome-extension")).toHaveCount(0);
});

test("a founding-GM invite link: sign up through it, confirm the email, accept → a verified GM; the link works once", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await login(page, "admin@questboard.test");
  await page.goto("/admin/gms");
  await page.getByLabel("Who is it for? (only admins see this)").fill("Gita · Malang");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByTestId("invite-link").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]+$/);
  const path = new URL(link).pathname;

  const gm = await newPage(browser);
  const email = `invited-${Date.now()}@questboard.test`;
  await gm.goto(path);
  await expect(gm.getByText("invites you to be one of Quest Board's founding Game Masters")).toBeVisible();
  await gm.getByRole("link", { name: "Create an account" }).click();
  await gm.getByLabel("Display name").fill("Gita Invited");
  await gm.getByLabel("Email").fill(email);
  await gm.getByLabel("Password").fill("tavern-demo-42");
  await gm.getByRole("button", { name: "Create account" }).click();
  await gm.waitForURL("**/signup/check-email");
  await gm.goto(await confirmLink(email));
  await gm.getByRole("button", { name: "Confirm my email" }).click();
  await gm.waitForURL(`**${path}`); // back on the invite, signed in
  await gm.getByRole("button", { name: "Accept: make me a verified GM" }).click();
  await gm.waitForURL("**/become-a-gm");
  await expect(gm.getByText("You're a verified GM now.")).toBeVisible();

  const db = e2eDb();
  const row = db.prepare("SELECT u.role, p.verified FROM users u JOIN gm_profiles p ON p.user_id = u.id WHERE u.email = ?").get(email) as { role: string; verified: number };
  db.close();
  expect({ ...row }).toEqual({ role: "gm", verified: 1 });

  await gm.goto(path); // used up
  await expect(gm.getByText("This invite link isn't valid, was already used, or has expired.")).toBeVisible();
  await page.goto("/admin/gms");
  await expect(page.getByTestId("invites").getByText("Used by Gita Invited")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("Gita Invited joined as a verified GM through")).toBeVisible();
});

test("pre-launch mode: players see 'opening soon' and can't book, can leave their email; opening sends it once", async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const db = e2eDb();
  const session = db.prepare("SELECT s.id FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE g.slug = 'signal-from-tartarus-station' AND s.starts_at > ? ORDER BY s.starts_at LIMIT 1").get(new Date().toISOString()) as { id: number };
  const email = `waiting-${Date.now()}@questboard.test`;
  try {
    await login(page, "admin@questboard.test");
    await page.goto("/admin");
    await page.getByTestId("prelaunch-card").getByRole("button", { name: "Turn on pre-launch mode" }).click();
    await expect(page.getByTestId("prelaunch-card").getByText(/^On: GMs can sign up/)).toBeVisible();

    const visitor = await newPage(browser);
    await visitor.goto("/games");
    await expect(visitor.getByTestId("prelaunch-banner")).toBeVisible();
    await login(visitor, "player@questboard.test");
    await visitor.goto(`/book/${session.id}`);
    await expect(visitor.getByText("Bookings open soon")).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Reserve my seat" })).toHaveCount(0);
    await visitor.goto("/opening");
    await visitor.getByLabel("Your email").fill(email);
    await visitor.getByRole("button", { name: "Tell me" }).click();
    await expect(visitor.getByText(`Thanks! We'll email ${email} once, when bookings open.`)).toBeVisible();
    expect(db.prepare("SELECT COUNT(*) AS n FROM launch_notify WHERE email = ?").get(email)).toEqual({ n: 1 });

    // Open to players (a confirmation first), then the scheduled job sends the one email and forgets the address.
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("prelaunch-card").getByRole("button", { name: "Open to players" }).click();
    await expect(page.getByTestId("prelaunch-card").getByText("Off: Quest Board is open to everyone.")).toBeVisible();
    const cron = await request.post("/api/cron/reminders", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    expect((await cron.json()).openingEmails).toBeGreaterThanOrEqual(1);
    expect(db.prepare("SELECT subject FROM email_outbox WHERE to_address = ?").get(email)).toEqual({ subject: "Quest Board is open — book your first table" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM launch_notify WHERE email = ?").get(email)).toEqual({ n: 0 });
    await visitor.goto("/games");
    await expect(visitor.getByTestId("prelaunch-banner")).toHaveCount(0);
  } finally {
    db.prepare("UPDATE app_state SET value = '0' WHERE key = 'prelaunch'").run(); // the other tests book seats
    db.close();
  }
});

test("the admin's launch pulse counts the last 7 and 30 days and all time", async ({ page }) => {
  await login(page, "admin@questboard.test");
  await page.goto("/admin");
  const pulse = page.getByTestId("launch-pulse");
  for (const h of ["Last 7 days", "Last 30 days", "All time"]) await expect(pulse.getByRole("columnheader", { name: h })).toBeVisible();
  for (const r of ["New members", "New GMs", "Sessions played", "Verified GMs (now)"]) await expect(pulse.getByRole("rowheader", { name: r })).toBeVisible();
  const verified = Number(await pulse.getByRole("row", { name: /Verified GMs/ }).getByRole("cell").last().innerText());
  expect(verified).toBeGreaterThan(0); // the seed has verified GMs
});
