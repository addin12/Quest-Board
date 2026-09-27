import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated WCAG 2.1 A/AA checks (axe-core) on the main pages, in both languages
// and both colour schemes. Axe catches roughly a third of real issues — keep
// doing the manual checklist in DESIGN.md too.

// Each test scans many pages with axe (and the first one warms up the server).
test.describe.configure({ timeout: 120_000 });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("password123");
  await page.locator("form button.btn-primary").click();
  await page.waitForURL("**/dashboard");
}

/** Axe violations on the current page, one readable line each (prefixed with `label`). */
async function violationsOf(page: Page, label: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.map((v) => `${label} → ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

const PUBLIC_PAGES = ["/", "/feedback", "/games", "/games/mercusuar-di-pulau-kabut", "/browse", "/browse/genre/horror", "/hire-a-gm", "/gms/1", "/login", "/signup", "/how-it-works", "/terms", "/privacy", "/forgot-password", "/board", "/quiz", "/quiz?mood=spooky&where=online&budget=any&experience=new"];

for (const scheme of ["light", "dark"] as const) {
  for (const lang of ["en", "id"] as const) {
    test.describe(`${lang} · ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      test("public pages have no axe violations", async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: "qb_lang", value: lang, url: baseURL! }]);
        const found: string[] = [];
        for (const path of PUBLIC_PAGES) {
          await page.goto(path);
          found.push(...(await violationsOf(page, `${path} [${lang}/${scheme}]`)));
        }
        expect(found).toEqual([]);
      });
    });
  }
}

test("signed-in pages and forms with errors have no axe violations", async ({ page }) => {
  await login(page, "gm@questboard.test");
  const found: string[] = [];
  for (const path of ["/dashboard", "/settings", "/gm", "/gm/requests", "/gm/games/new", "/become-a-gm", "/hire-a-gm/request", "/notifications", "/board/new", "/dashboard?view=calendar", "/gm/questions", "/gm/earnings", "/games/naga-naga-hutan-bara-petualangan-pemula/ask"]) {
    await page.goto(path);
    found.push(...(await violationsOf(page, path)));
  }
  // Errors are linked to their fields.
  await page.goto("/hire-a-gm/request");
  await page.getByRole("button", { name: "Send request" }).click();
  const title = page.locator("#title");
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription("Write a short title (5–80 characters).");
  found.push(...(await violationsOf(page, "/hire-a-gm/request with errors")));
  expect(found).toEqual([]);
});

test("the admin console has no axe violations", async ({ page }) => {
  await login(page, "admin@questboard.test");
  const found: string[] = [];
  for (const path of ["/admin", "/admin/reports", "/admin/reports?status=resolved", "/admin/gms", "/admin/users", "/admin/errors", "/admin/feedback"]) {
    await page.goto(path);
    found.push(...(await violationsOf(page, path)));
  }
  expect(found).toEqual([]);
});

test("a brand-new GM's dashboard (with the getting-started checklist) has no axe violations", async ({ page }) => {
  await page.goto("/signup");
  await page.getByText("Run games").click();
  await page.getByLabel("Display name").fill("Axe Check GM");
  await page.getByLabel("Email").fill(`axe-gm-${Date.now()}@questboard.test`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/gm");
  await expect(page.getByRole("heading", { name: "Get your table ready" })).toBeVisible();
  const found = await violationsOf(page, "/gm (new GM)");
  await page.goto("/settings");
  found.push(...(await violationsOf(page, "/settings (new GM)")));
  expect(found).toEqual([]);
});
