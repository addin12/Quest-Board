import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Every internal link on the main pages leads somewhere (no 404s or 500s). Signed in as the
// admin, who may open every page, so "not allowed" can't hide a broken link.
test("no broken internal links on the main pages", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "admin@questboard.test");
  const pages = ["/", "/games", "/browse", "/board", "/hire-a-gm", "/dashboard", "/settings", "/notifications", "/gm", "/gm/requests",
    "/admin", "/admin/reports", "/admin/gms", "/admin/users", "/games/mercusuar-di-pulau-kabut", "/gms/1", "/browse/mechanic/d20-system"];
  const links = new Map<string, string>();
  for (const path of pages) {
    await page.goto(path);
    for (const href of await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      const clean = href.split("#")[0];
      if (clean && !clean.startsWith("/api/") && !clean.startsWith("/dev") && !links.has(clean)) links.set(clean, path);
    }
  }
  expect(links.size).toBeGreaterThan(50);
  const broken: string[] = [];
  for (const [href, from] of links) {
    const res = await page.request.get(href, { maxRedirects: 0 });
    if (res.status() >= 400) broken.push(`${href} (${res.status()}) on ${from}`);
  }
  expect(broken).toEqual([]);
});
