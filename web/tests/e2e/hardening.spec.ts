import { test, expect, type Page } from "@playwright/test";
import { e2eDb } from "./helpers";

// Regression tests for the P1 fixes in IMPROVEMENTS.md.
// Uses seed games no other spec mutates: "Darah di Balik Tirai Beludru" (seat edit),
// "Panen Harapan" (archive), "Mercusuar di Pulau Kabut" (chat volume, read-only elsewhere).

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

test("P1-11 security headers are sent", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("pages allow only their own nonce'd scripts, and nothing trips the policy", async ({ page, request }) => {
  const a = (await request.get("/")).headers()["content-security-policy"];
  const b = (await request.get("/id/games")).headers()["content-security-policy"];
  const scripts = (csp: string) => csp.split("; ").find((d) => d.startsWith("script-src "))!;
  expect(scripts(a)).toMatch(/'nonce-[A-Za-z0-9+/=]{20,}' 'strict-dynamic'/);
  expect(scripts(a)).not.toContain("'unsafe-inline'");
  expect(scripts(a)).not.toBe(scripts(b)); // a fresh nonce per request
  expect(scripts((await request.get("/api/health")).headers()["content-security-policy"])).toBe("script-src 'self'");

  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { cspViolations: string[] }).cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await login(page, "player@questboard.test"); // a client-side redirect after a server action: the app hydrated
  // (Not /id/...: signed in, that would switch this player's language for later tests.)
  for (const path of ["/dashboard", "/", "/games", "/board"]) {
    if (path !== "/dashboard") await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations), path).toEqual([]);
  }
});

test("P1-6 search treats % and _ literally", async ({ page }) => {
  await page.goto("/games?q=%25");
  await expect(page.getByText("No games match those filters")).toBeVisible();
  await page.goto("/games?q=_");
  await expect(page.getByText("No games match those filters")).toBeVisible();
  await page.goto("/games?q=Mercusuar");
  await expect(page.getByRole("link", { name: /Mercusuar di Pulau Kabut/ })).toBeVisible();
});

// Must match "login=" in QUESTBOARD_RATE_LIMIT_OVERRIDES (playwright.config.ts). Production uses 10.
const E2E_LOGIN_LIMIT = 40;

test("P1-9 repeated failed logins are rate limited", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // type only once the form has hydrated
  for (let i = 0; i < E2E_LOGIN_LIMIT; i++) {
    // The previous attempt has fully finished first: React resets the form when it does, which
    // could otherwise wipe what we type next (then the browser won't submit the empty field).
    const button = page.getByRole("button", { name: "Log in" });
    await expect(button).toBeEnabled();
    await page.getByLabel("Email").fill("brute@force.test");
    await page.getByLabel("Password").fill(`wrong-${i}`);
    await expect(page.getByLabel("Password")).toHaveValue(`wrong-${i}`);
    // Wait for this attempt's response: the error text is already on screen from the last one.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/login"), { timeout: 15_000 }),
      button.click(),
    ]);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  // Failed attempts keep the typed email (React resets forms; the action echoes values back).
  await expect(page.getByLabel("Email")).toHaveValue("brute@force.test");
  await page.getByLabel("Password").fill("wrong-again");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Too many attempts")).toBeVisible();
});

test("P1-1 a GM cannot lower seats below what an upcoming session already holds", async ({ page }) => {
  await login(page, "gm@questboard.test");
  await page.goto("/gm");
  await page.locator(".card > div", { hasText: "Darah di Balik Tirai Beludru" }).getByRole("link", { name: "Manage" }).click();
  await page.getByRole("link", { name: "Edit details" }).click();
  await page.getByLabel("Seats per session").fill("1"); // a seeded session already has 3 players
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/already has more players booked than that/)).toBeVisible();
  await expect(page).toHaveURL(/\/edit$/);
});

test("P1-3 table chat shows the newest 50 messages, and up to 200 with “Show earlier messages”", async ({ page }) => {
  const db = e2eDb();
  const game = db.prepare("SELECT id, gm_id FROM games WHERE slug = ?").get("mercusuar-di-pulau-kabut") as { id: number; gm_id: number };
  const ins = db.prepare("INSERT INTO messages (game_id, user_id, body, created_at) VALUES (?, ?, ?, ?)");
  const base = Date.now(); // newer than anything other tests posted, so "the newest 50" is exactly #156–#205
  db.exec("BEGIN");
  for (let i = 1; i <= 205; i++) ins.run(game.id, game.gm_id, `Bulk message #${i}`, new Date(base + i * 1000).toISOString());
  db.exec("COMMIT");
  db.close();

  try {
    await login(page, "gm@questboard.test");
    await page.goto("/games/mercusuar-di-pulau-kabut");
    await expect(page.getByText("Bulk message #205", { exact: true })).toBeVisible();
    await expect(page.getByText("Bulk message #156", { exact: true })).toBeAttached(); // the newest 50
    await expect(page.getByText("Bulk message #155", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Show earlier messages" }).click();
    await expect(page).toHaveURL(/chat=all/);
    await expect(page.getByText("Bulk message #6", { exact: true })).toBeAttached(); // the newest 200
    await expect(page.getByText("Bulk message #5", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Show earlier messages" })).toHaveCount(0);
  } finally {
    // They're dated slightly in the future: remove them, or later chat tests' messages would sort below them.
    const cleanup = e2eDb();
    cleanup.prepare("DELETE FROM messages WHERE game_id = ? AND body LIKE 'Bulk message #%'").run(game.id);
    cleanup.close();
  }
});

test("P1-2 archiving a game cancels its upcoming sessions and frees players' seats", async ({ browser }) => {
  const db = e2eDb();
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  const gm = await browser.newPage();
  await login(gm, "dewi@questboard.test");
  await gm.goto("/gm");
  await gm.locator(".card > div", { hasText: "Panen Harapan" }).getByRole("link", { name: "Manage" }).click();
  let dialogText = "";
  gm.once("dialog", (d) => { dialogText = d.message(); void d.accept(); });
  await gm.getByRole("button", { name: "Archive game" }).click();
  await gm.waitForURL("**/gm");
  expect(dialogText).toMatch(/6 players' seats are released/);
  await expect(gm.getByText("Panen Harapan")).toHaveCount(0);

  const player = await browser.newPage();
  await login(player, "player@questboard.test");
  const row = player.locator(".card", { has: player.getByRole("link", { name: "Panen Harapan" }) }).first();
  await expect(row.getByText("Cancelled by GM")).toBeVisible();

  // Players are emailed too (they might otherwise turn up), with a link that still works.
  const mails = db.prepare("SELECT to_address, body_text FROM email_outbox WHERE id > ? AND subject LIKE 'Cancelled: Panen Harapan%'").all(mark) as { to_address: string; body_text: string }[];
  db.close();
  expect(mails.map((m) => m.to_address)).toContain("player@questboard.test");
  expect(mails.every((m) => !m.body_text.includes("/games/panen-harapan"))).toBe(true);
  // The bell links to My games, not the archived game's (now missing) page.
  await player.goto("/notifications");
  await expect(player.locator('a[href*="/games/panen-harapan"]')).toHaveCount(0);
});

test("P1-10 log out on all devices revokes other sessions", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await login(a, "putri@questboard.test");
  await login(b, "putri@questboard.test");

  await a.goto("/settings");
  a.once("dialog", (d) => void d.accept());
  await a.getByRole("button", { name: "Log out on all devices" }).click();
  await a.waitForURL("**/login");

  await b.goto("/dashboard");
  await expect(b).toHaveURL(/\/login/);
});

test("P1-12 booked players see an anti-scam note next to the GM's payment details", async ({ page }) => {
  await login(page, "player@questboard.test");
  await page.goto("/games/mercusuar-di-pulau-kabut"); // Andi holds a seat here
  await expect(page.getByText("How to pay the GM")).toBeVisible();
  await expect(page.getByText(/will never ask for your OTP, PIN or password/)).toBeVisible();
  await expect(page.getByText("Joined Quest Board less than 30 days ago and has no reviews yet.")).toHaveCount(0); // an established GM
});

test("forms keep what the user typed after a validation error", async ({ page }) => {
  await login(page, "bima@questboard.test");
  await page.goto("/gm/games/new");
  await page.getByLabel("Title").fill("Kota Tanpa Nama");
  await page.getByLabel("One-line summary").fill("too short"); // invalid: under 10 characters
  await page.getByLabel(/Price per seat/).fill("65.000");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Kota Tanpa Nama");
  await expect(page.getByLabel("One-line summary")).toHaveValue("too short");
  await expect(page.getByLabel(/Price per seat/)).toHaveValue("65.000");
});

test("login never redirects off-site, even with a backslash trick", async ({ page }) => {
  await page.goto("/login?next=" + encodeURIComponent("/\\evil.example"));
  await page.getByLabel("Email").fill("player@questboard.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
});

test("live threads poll a tiny change token and re-render only when something changed", async ({ browser, request }) => {
  const gm = await (await browser.newContext()).newPage();
  await login(gm, "gm@questboard.test");
  await gm.goto("/games/mercusuar-di-pulau-kabut");
  await gm.waitForLoadState("networkidle");
  // With nothing new, the open page only asks for the token (no full re-render of the page).
  const rerenders: string[] = [];
  gm.on("request", (r) => { if (r.headers()["rsc"] === "1") rerenders.push(r.url()); });
  const polled = gm.waitForResponse((r) => r.url().includes("/api/changes?kind=chat"), { timeout: 30_000 });
  expect((await polled).status()).toBe(200);
  expect(rerenders).toEqual([]);

  // A player posts from another browser: the GM's open page shows it without reloading.
  const player = await (await browser.newContext()).newPage();
  await login(player, "player@questboard.test");
  await player.goto("/games/mercusuar-di-pulau-kabut");
  const text = `Live update check ${Date.now()}`;
  await player.getByLabel("Message").fill(text);
  await player.getByRole("button", { name: "Send" }).click();
  await expect(player.getByText(text)).toBeVisible();
  await expect(gm.getByText(text)).toBeVisible({ timeout: 40_000 });
  await expect(gm.getByRole("status").filter({ hasText: "New message from Andi Wijaya" })).toBeAttached(); // for screen readers
  // Leave the demo chat as it was (another spec checks the GM's own game page has nothing of theirs to report).
  const db = e2eDb();
  db.prepare("DELETE FROM messages WHERE body = ?").run(text);
  db.close();

  // The token follows the page's access rule: table chat is for members only; notices are public.
  expect((await request.get("/api/changes?kind=chat&id=1")).status()).toBe(404);
  expect((await request.get("/api/changes?kind=question&id=1")).status()).toBe(404);
  expect((await request.get("/api/changes?kind=nope&id=1")).status()).toBe(404);
});
