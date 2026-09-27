import { test, expect } from "@playwright/test";
import { e2eDb } from "./helpers";

test("P3-3 /id and /en URLs show that language, list both in hreflang, and remember the choice", async ({ page, request }) => {
  await page.goto("/id/games");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1, name: "Cari game" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/id\/games$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/games$/);
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/games$/);

  // Visiting a language URL remembers it: plain URLs now open in Indonesian too.
  await page.goto("/games");
  await expect(page.getByRole("heading", { level: 1, name: "Cari game" })).toBeVisible();

  // The switcher on a language URL moves to the other language's URL.
  await page.goto("/id/games/mercusuar-di-pulau-kabut");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/games\/mercusuar-di-pulau-kabut$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // A crawler with no cookies gets each language at its own URL.
  expect(await (await request.get("/id")).text()).toContain('<html lang="id"');
  expect(await (await request.get("/en")).text()).toContain('<html lang="en"');
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/id/games/mercusuar-di-pulau-kabut</loc>");
  expect(sitemap).toMatch(/hreflang="id"/);

  // Private pages keep working behind a prefix (and stay out of search engines).
  await page.goto("/id/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /id/dashboard");
});

test("a GM profile shows 12 games, and 'See all' opens the full list filtered to that GM", async ({ page }) => {
  const tag = `gmcap${Date.now()}`;
  const db = e2eDb();
  const cols = (db.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name).filter((c) => !["id", "slug", "title"].includes(c));
  const ins = db.prepare(`INSERT INTO games (slug, title, ${cols.join(", ")}) SELECT ?, ?, ${cols.join(", ")} FROM games WHERE slug = 'mercusuar-di-pulau-kabut'`);
  const gm = db.prepare("SELECT gm_id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { gm_id: number };
  for (let i = 1; i <= 12; i++) ins.run(`${tag}-${i}`, `Extra table ${tag} ${i}`);
  try {
    const total = (db.prepare("SELECT COUNT(*) AS n FROM games WHERE gm_id = ? AND status = 'published'").get(gm.gm_id) as { n: number }).n;
    await page.goto(`/gms/${gm.gm_id}`);
    await expect(page.locator("main h3")).toHaveCount(12);
    await page.getByRole("link", { name: `See all ${total} games` }).click();
    await expect(page).toHaveURL(new RegExp(`/games\\?gm=${gm.gm_id}$`));
    await expect(page.getByText(`${total} games looking for players`)).toBeVisible();
    await expect(page.getByRole("link", { name: /Games by Raka Pradipta/ })).toBeVisible();
    // Applying another filter keeps the GM filter.
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(new RegExp(`gm=${gm.gm_id}`));
  } finally {
    db.prepare("DELETE FROM games WHERE slug LIKE ?").run(`${tag}-%`);
    db.close();
  }
});
