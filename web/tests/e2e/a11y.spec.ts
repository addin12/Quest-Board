import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { confirmLink, e2eDb, signup } from "./helpers";
import { totpCode, totpStep } from "../../src/lib/totp";
import { LEGAL_VERSION } from "../../src/lib/legal";

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
  // Next streams the <title> in after the page on some navigations: wait for it, or axe reports it missing.
  await expect(page).toHaveTitle(/\S/);
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

test("sign-up's check-email and confirm pages, and a brand-new GM's dashboard (with the checklist), have no axe violations", async ({ page }) => {
  const email = `axe-gm-${Date.now()}@questboard.test`;
  await page.goto("/signup");
  await page.getByText("Run games").click();
  await page.getByLabel("Display name").fill("Axe Check GM");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/signup/check-email");
  const found = await violationsOf(page, "/signup/check-email");
  await page.goto(await confirmLink(email));
  found.push(...(await violationsOf(page, "/verify-email (confirm)")));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL("**/gm");
  await expect(page.getByRole("heading", { name: "Get your table ready" })).toBeVisible();
  found.push(...(await violationsOf(page, "/gm (new GM)")));
  await page.goto("/settings");
  found.push(...(await violationsOf(page, "/settings (new GM)")));
  expect(found).toEqual([]);
});

test("two-step, payment-change and automatic-flag screens have no axe violations", async ({ browser }) => {
  const db = e2eDb();
  const email = `axe-admin-${Date.now()}@questboard.test`;
  db.prepare("INSERT INTO users (email, password_hash, name, role, email_verified_at) SELECT ?, password_hash, 'Axe Admin', 'admin', created_at FROM users WHERE email = 'admin@questboard.test'").run(email);
  const adminId = (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  // A recent payment change by the GM of a game the demo player sits in, twice (so the admin flag shows too),
  // and an automatic flag on that game's chat.
  db.prepare("INSERT INTO payment_changes (user_id) VALUES (1), (1)").run();
  db.prepare("INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href) VALUES (NULL, 'message', 1, 1, 'scam', 'credentials,newAccount', 'Table chat (axe check)', '/games/mercusuar-di-pulau-kabut#chat-h')").run();
  const found: string[] = [];
  try {
    const admin = await (await browser.newContext()).newPage();
    await login(admin, email);
    for (const path of ["/admin", "/admin/reports", "/admin/gms"]) { await admin.goto(path); found.push(...(await violationsOf(admin, `${path} (flags)`))); }
    await admin.goto("/settings");
    await admin.getByRole("button", { name: "Set up two-step login" }).click();
    await expect(admin.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
    found.push(...(await violationsOf(admin, "/settings (two-step setup)")));
    const key = (await admin.getByTestId("totp-key").innerText()).replace(/\s/g, "");
    await admin.getByLabel("6-digit code").fill("000000");
    await admin.getByRole("button", { name: "Turn on" }).click();
    await expect(admin.getByText("That code didn't work.")).toBeVisible();
    found.push(...(await violationsOf(admin, "/settings (two-step, wrong code)")));
    await admin.getByLabel("6-digit code").fill(totpCode(key, totpStep(Date.now()) - 1));
    await admin.getByRole("button", { name: "Turn on" }).click();
    await expect(admin.getByText(/Two-step login is on \(since/)).toBeVisible();
    found.push(...(await violationsOf(admin, "/settings (two-step on)")));

    const second = await (await browser.newContext()).newPage();
    await second.goto("/login");
    await second.locator("#email").fill(email);
    await second.locator("#password").fill("password123");
    await second.locator("form button.btn-primary").click();
    await second.waitForURL("**/login/code");
    found.push(...(await violationsOf(second, "/login/code")));
    await second.goto("/login?step=locked");
    found.push(...(await violationsOf(second, "/login?step=locked")));

    const player = await (await browser.newContext()).newPage();
    await login(player, "player@questboard.test");
    await player.goto("/games/mercusuar-di-pulau-kabut");
    await expect(player.getByText(/These payment details were changed on/)).toBeVisible();
    found.push(...(await violationsOf(player, "/games/… (payment changed)")));
  } finally {
    db.prepare("DELETE FROM payment_changes WHERE user_id = 1").run();
    db.prepare("DELETE FROM reports WHERE reporter_id IS NULL AND snapshot = 'Table chat (axe check)'").run();
    db.prepare("DELETE FROM users WHERE id = ?").run(adminId);
    db.close();
  }
  expect(found).toEqual([]);
});

// Signed-in pages with the newest states on screen (policy banner, payment-change note and report
// link, badges, device list, automatic flags), in dark mode and at phone width.
for (const [scheme, width] of [["dark", 1280], ["light", 360], ["dark", 360]] as const) {
  test.describe(`signed in · ${scheme} · ${width}px`, () => {
    test.use({ colorScheme: scheme, viewport: { width, height: width === 360 ? 780 : 900 } });

    test("signed-in pages with the newest states have no axe violations", async ({ browser }) => {
      const db = e2eDb();
      db.prepare("INSERT INTO payment_changes (user_id) VALUES (1), (1)").run();
      db.prepare("UPDATE users SET legal_seen_version = 'old' WHERE email IN ('player@questboard.test', 'gm@questboard.test', 'admin@questboard.test')").run();
      db.prepare("INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, details, snapshot, href) VALUES (NULL, 'message', 1, 1, 'scam', 'credentials,offPlatformPay', 'Table chat (axe themes)', '/games/mercusuar-di-pulau-kabut#chat-h')").run();
      const found: string[] = [];
      const tag = `[${scheme}/${width}]`;
      try {
        const opts = { colorScheme: scheme, viewport: { width, height: width === 360 ? 780 : 900 } } as const;
        const player = await (await browser.newContext(opts)).newPage();
        await login(player, "player@questboard.test");
        for (const path of ["/dashboard", "/games", "/games/mercusuar-di-pulau-kabut", "/settings", "/notifications"]) {
          await player.goto(path);
          found.push(...(await violationsOf(player, `${path} (player) ${tag}`)));
        }
        const gm = await (await browser.newContext(opts)).newPage();
        await login(gm, "gm@questboard.test");
        for (const path of ["/gm", "/settings", "/gms/1"]) {
          await gm.goto(path);
          found.push(...(await violationsOf(gm, `${path} (GM) ${tag}`)));
        }
        const admin = await (await browser.newContext(opts)).newPage();
        await login(admin, "admin@questboard.test");
        for (const path of ["/admin", "/admin/reports", "/admin/gms"]) {
          await admin.goto(path);
          found.push(...(await violationsOf(admin, `${path} (admin) ${tag}`)));
        }
      } finally {
        db.prepare("DELETE FROM payment_changes WHERE user_id = 1").run();
        db.prepare("UPDATE users SET legal_seen_version = ? WHERE email IN ('player@questboard.test', 'gm@questboard.test', 'admin@questboard.test')").run(LEGAL_VERSION);
        db.prepare("DELETE FROM reports WHERE reporter_id IS NULL AND snapshot = 'Table chat (axe themes)'").run();
        db.close();
      }
      expect(found).toEqual([]);
    });
  });
}

test.describe("phone width", () => {
  // Narrow screens hide labels and show other controls (tab bar, filter sheet, booking bar).
  test.use({ viewport: { width: 360, height: 780 } });

  test("public pages and a new player's dashboard have no axe violations", async ({ page }) => {
    const found: string[] = [];
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      found.push(...(await violationsOf(page, `${path} [360px]`)));
    }
    await signup(page, "Axe Check Player", `axe-player-${Date.now()}@questboard.test`);
    await expect(page.getByRole("heading", { name: "Welcome to the tavern!" })).toBeVisible();
    found.push(...(await violationsOf(page, "/dashboard (new player) [360px]")));
    expect(found).toEqual([]);
  });
});
