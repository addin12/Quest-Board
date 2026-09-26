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
