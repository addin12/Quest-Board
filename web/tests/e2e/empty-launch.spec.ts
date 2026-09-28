import { test, expect } from "@playwright/test";

// Runs against a database with no demo data (see playwright.config.ts "empty" project):
// what the very first visitors see before any GM has listed a game.

test("launch day: every public page works and invites the first GMs and players", async ({ page, request }) => {
  for (const path of ["/", "/games", "/browse", "/browse/genre/horror", "/browse/mechanic/osr", "/board", "/hire-a-gm", "/quiz", "/how-it-works", "/become-a-gm", "/terms", "/privacy", "/id", "/sitemap.xml", "/api/games"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  await page.goto("/");
  await expect(page.getByText("The first tables are being set up")).toBeVisible();
  await page.getByRole("link", { name: "Become a founding GM" }).first().click();
  await expect(page).toHaveURL(/\/become-a-gm$/);

  await page.goto("/games");
  await expect(page.getByText("The first tables are being set up")).toBeVisible();
  await page.goto("/games?q=anything");
  await expect(page.getByText("No games match those filters")).toBeVisible();

  await page.goto("/hire-a-gm");
  await expect(page.getByText("No Game Masters listed yet")).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: "of the price goes to the GM" })).toHaveCount(1); // no tiles full of zeros
  await expect(page.getByText("sessions hosted")).toHaveCount(0);

  await page.goto("/board");
  await expect(page.getByText("No notices yet. Be the first to pin one!")).toBeVisible();
});

test("launch day: there is no demo admin — admins come from `npm run admin`", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@questboard.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByText(/incorrect|wrong|invalid/i).first()).toBeVisible();
});

test("outside dev, the email outbox never keeps a working verification link", async ({ page }) => {
  const email = `first-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel(/display name/i).fill("First Visitor");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /create account|sign up/i }).click();
  await expect(page).toHaveURL(/\/signup\/check-email$/);
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync("data/e2e-empty.db", { readOnly: true });
  const row = db.prepare("SELECT body_text FROM email_outbox WHERE to_address = ?").get(email) as { body_text: string };
  db.close();
  expect(row.body_text).toContain("[link removed]");
  expect(row.body_text).not.toMatch(/token=/);
});

test("the public API is rate-limited per IP (120 requests a minute)", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 125; i++) statuses.push((await request.get("/api/games?limit=1")).status());
  expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(120);
  expect(statuses.at(-1)).toBe(429);
  const res = await request.get("/api/games/anything");
  expect(res.status()).toBe(429);
  expect(res.headers()["retry-after"]).toBe("60");
});
