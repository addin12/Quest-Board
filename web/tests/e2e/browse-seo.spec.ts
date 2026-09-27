import { test, expect } from "@playwright/test";
import { e2eDb } from "./helpers";

test("P2-5 browse shows 24 games, then 'Load more' adds the next batch", async ({ page }) => {
  // 30 copies of a demo game, found by a keyword nothing else uses, so other tests are unaffected.
  const tag = `Pagination${Date.now()}`;
  const db = e2eDb();
  const cols = (db.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name).filter((c) => c !== "id" && c !== "slug" && c !== "title");
  const ins = db.prepare(`INSERT INTO games (slug, title, ${cols.join(", ")}) SELECT ?, ?, ${cols.join(", ")} FROM games WHERE slug = 'mercusuar-di-pulau-kabut'`);
  db.exec("BEGIN");
  for (let i = 1; i <= 30; i++) ins.run(`${tag.toLowerCase()}-${i}`, `${tag} ${i}`);
  db.exec("COMMIT");
  try {
    await page.goto(`/games?q=${tag}`);
    await expect(page.getByText("30 games looking for players")).toBeVisible();
    const cards = page.getByRole("region", { name: "Results" }).getByRole("heading", { level: 3 });
    await expect(cards).toHaveCount(24);
    await expect(page.getByText("Showing 24 of 30")).toBeVisible();
    await page.getByRole("link", { name: "Load more games" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(new RegExp(`q=${tag}`));
    await expect(cards).toHaveCount(30);
    await expect(page.getByText("Showing 30 of 30")).toBeVisible();
    await expect(page.getByRole("link", { name: "Load more games" })).toHaveCount(0);
    // No game appears twice across the batches.
    const titles = await cards.allTextContents();
    expect(new Set(titles).size).toBe(30);

    // The JSON API pages the same way.
    const a = await (await page.request.get(`/api/games?q=${tag}&limit=20`)).json();
    const b = await (await page.request.get(`/api/games?q=${tag}&limit=20&offset=20`)).json();
    expect(a.total).toBe(30);
    expect(a.data).toHaveLength(20);
    expect(b.data).toHaveLength(10);
    expect(a.data.map((g: { id: number }) => g.id)).not.toContain(b.data[0].id);
  } finally {
    db.prepare("DELETE FROM games WHERE slug LIKE ?").run(`${tag.toLowerCase()}-%`);
    db.close();
  }
});

test("P2-7 filter by city, and the keyword search finds GMs by their location", async ({ page }) => {
  await page.goto("/games");
  await page.getByLabel("City").selectOption({ label: "Bandung (1)" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/city=Bandung/);
  await expect(page.getByText("1 game looking for players")).toBeVisible();

  // Case-insensitive, and a city with no games shows the empty state (not an error).
  await page.goto("/games?city=bandung");
  await expect(page.getByText("1 game looking for players")).toBeVisible();
  await page.goto("/games?city=Surabaya");
  await expect(page.getByText("No games match those filters")).toBeVisible();

  // Raka's GM profile says Jakarta; none of his games mention it, but the search finds them.
  const r = await (await page.request.get("/api/games?q=Jakarta")).json();
  expect(r.total).toBeGreaterThanOrEqual(3);
  expect(r.data.every((g: { gm: { name: string } }) => g.gm.name === "Raka Pradipta")).toBe(true);
});

test("P2-17 robots.txt, sitemap.xml, canonical URLs and Event data for search engines", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dashboard");
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toMatch(/Sitemap: http.*\/sitemap\.xml/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain("/games/mercusuar-di-pulau-kabut</loc>");
  expect(xml).toContain("/browse/genre/");
  expect(xml).not.toContain("/dashboard");

  await page.goto("/games/mercusuar-di-pulau-kabut");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/games\/mercusuar-di-pulau-kabut$/);
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
  const events = JSON.parse(raw ?? "[]") as Record<string, unknown>[];
  expect(events.length).toBeGreaterThan(0);
  const e = events[0] as { "@type": string; startDate: string; offers: { priceCurrency: string }; organizer: { name: string } };
  expect(e["@type"]).toBe("Event");
  expect(e.offers.priceCurrency).toBe("IDR");
  expect(new Date(e.startDate).getTime()).toBeGreaterThan(Date.now());
  // Only public details: never the GM's payment info.
  expect(raw).not.toMatch(/BCA|GoPay|OVO|DANA|rekening/i);
});
