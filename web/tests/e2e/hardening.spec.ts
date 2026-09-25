import { test, expect, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";

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
    await page.getByLabel("Email").fill("brute@force.test");
    await page.getByLabel("Password").fill(`wrong-${i}`);
    // Wait for this attempt's response: the error text is already on screen from the last one.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/login")),
      page.getByRole("button", { name: "Log in" }).click(),
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

test("P1-3 table chat shows the newest messages when there are more than 200", async ({ page }) => {
  const db = new DatabaseSync("data/e2e.db");
  const game = db.prepare("SELECT id, gm_id FROM games WHERE slug = ?").get("mercusuar-di-pulau-kabut") as { id: number; gm_id: number };
  const ins = db.prepare("INSERT INTO messages (game_id, user_id, body, created_at) VALUES (?, ?, ?, ?)");
  const base = Date.now() - 300_000;
  db.exec("BEGIN");
  for (let i = 1; i <= 205; i++) ins.run(game.id, game.gm_id, `Bulk message #${i}`, new Date(base + i * 1000).toISOString());
  db.exec("COMMIT");
  db.close();

  await login(page, "gm@questboard.test");
  await page.goto("/games/mercusuar-di-pulau-kabut");
  await expect(page.getByText("Bulk message #205", { exact: true })).toBeVisible();
  await expect(page.getByText("Bulk message #1", { exact: true })).toHaveCount(0);
});

test("P1-2 archiving a game cancels its upcoming sessions and frees players' seats", async ({ browser }) => {
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
