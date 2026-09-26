import { test, expect } from "@playwright/test";

test("browse by mechanic: hub section, mechanic page, filters and the game page chip", async ({ page, request }) => {
  await page.goto("/browse");
  const mechanics = page.locator("#mechanics");
  await expect(mechanics.getByRole("heading", { name: "Mechanics" })).toBeVisible();
  await expect(mechanics.getByRole("link", { name: /^d20 System/ })).toBeVisible();
  // ~90 systems without games are folded away until asked for.
  const more = page.getByText(/^Show all \d+ systems$/);
  await expect(more).toBeVisible();
  await expect(page.getByRole("link", { name: "Fabula Ultima" })).toBeHidden();
  await more.click();
  await expect(page.getByRole("link", { name: "Fabula Ultima" })).toBeVisible();

  await mechanics.getByRole("link", { name: /^d20 System/ }).first().click();
  await expect(page).toHaveURL(/\/browse\/mechanic\/d20-system$/);
  await expect(page.getByRole("heading", { level: 1, name: "d20 System" })).toBeVisible();
  await expect(page.getByRole("link", { name: "D&D 5e (2014)", exact: true })).toBeVisible(); // systems built on it

  // Every game found through a mechanic runs on one of its systems.
  const api = await (await request.get("/api/games?mechanic=d20-system&limit=100")).json();
  expect(api.total).toBeGreaterThan(0);
  const d20 = ["D&D 5.5e (2024)", "D&D 5e (2014)", "Pathfinder 2e", "Starfinder"];
  for (const g of api.data as { system: string }[]) expect(d20).toContain(g.system);
  const pbta = await (await request.get("/api/games?mechanic=powered-by-the-apocalypse")).json();
  expect(pbta.total).toBe(0);

  // The /games filter and the game page chip.
  await page.goto("/games");
  await page.getByLabel("Mechanic").selectOption({ label: "d20 System" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/mechanic=d20-system/);
  await expect(page.getByText(`${api.total} game`, { exact: false }).first()).toBeVisible();
  const slug = (api.data as { slug: string }[])[0].slug;
  await page.goto(`/games/${slug}`);
  await page.getByRole("link", { name: "d20 System", exact: true }).click();
  await expect(page).toHaveURL(/\/browse\/mechanic\/d20-system$/);
});

test("new genres, styles and systems have their own pages, in both languages", async ({ page }) => {
  await page.goto("/browse/genre/space-opera");
  await expect(page.getByRole("heading", { level: 1, name: "Space opera" })).toBeVisible();
  await page.goto("/browse/style/west-marches");
  await expect(page.getByRole("heading", { level: 1, name: "West Marches" })).toBeVisible();
  await page.goto("/browse/system/fabula-ultima");
  await expect(page.getByRole("heading", { level: 1, name: "Fabula Ultima" })).toBeVisible();
  await page.goto("/id/browse/genre/pirate");
  await expect(page.getByRole("heading", { level: 1, name: "Bajak laut" })).toBeVisible();
  await page.goto("/id/browse/mechanic/osr");
  await expect(page.getByText("Gaya lawas: dungeon mematikan")).toBeVisible();
  // Unknown keys are a 404, not an empty page.
  expect((await page.goto("/browse/mechanic/not-a-mechanic"))?.status()).toBe(404);
});

test("home page: 'Browse by categories' medallions lead to each part of the Browse hub", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Browse by categories" }) });
  for (const name of ["Game systems", "Genres", "Play styles", "Mechanics"]) await expect(section.getByRole("link", { name })).toBeVisible();
  await section.getByRole("link", { name: "Mechanics" }).click();
  await expect(page).toHaveURL(/\/browse#mechanics$/);
  await expect(page.locator("#mechanics")).toBeInViewport();
  await page.goto("/");
  await section.getByRole("link", { name: "Browse all categories" }).click();
  await expect(page).toHaveURL(/\/browse$/);
});
