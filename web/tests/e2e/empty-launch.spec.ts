import { test, expect } from "@playwright/test";
import { LIMITS } from "../../src/lib/limits";
import { hashPassword } from "../../src/lib/password";
import { totpCode, totpStep } from "../../src/lib/totp";

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

test("the public API is rate-limited per IP", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < LIMITS.api.limit + 5; i++) statuses.push((await request.get("/api/games?limit=1")).status());
  expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(LIMITS.api.limit);
  expect(statuses.at(-1)).toBe(429);
  const res = await request.get("/api/games/anything");
  expect(res.status()).toBe(429);
  expect(res.headers()["retry-after"]).toBe("60");
});

test("the admin console needs two-step login: an admin without it is sent to set it up", async ({ browser }) => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync("data/e2e-empty.db");
  db.exec("PRAGMA busy_timeout = 5000");
  const email = `owner-${Date.now()}@example.com`;
  db.prepare("INSERT INTO users (email, password_hash, name, role, email_verified_at) VALUES (?, ?, 'Owner', 'admin', ?)").run(email, hashPassword("password123"), new Date().toISOString());
  db.close();
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL("**/dashboard");
  for (const path of ["/admin", "/admin/reports", "/admin/users"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/settings\?twoStep=required/);
  }
  await expect(page.getByText("The admin console needs two-step login.")).toBeVisible();
  await page.getByRole("button", { name: "Set up two-step login" }).click();
  const key = (await page.getByTestId("totp-key").innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(totpCode(key, totpStep(Date.now()) - 1));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText(/Two-step login is on \(since/)).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("navigation", { name: /admin/i })).toBeVisible();
});
