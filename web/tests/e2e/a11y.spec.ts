import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { confirmLink, createGmWithGame, e2eDb, signup } from "./helpers";
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
  await page.locator("#password").fill("tavern-demo-42");
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
  await page.getByLabel("Password").fill("tavern-demo-42");
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
    await second.locator("#password").fill("tavern-demo-42");
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

for (const scheme of ["light", "dark"] as const) {
  test.describe(`newer screens · ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test("Settings with the bounce banner and errors, and the change-email page, have no axe violations", async ({ page }) => {
      const { createHash } = await import("node:crypto");
      const email = `a11y-new-${scheme}-${Date.now()}@questboard.test`;
      await signup(page, "Ayu Axe", email);
      const db = e2eDb();
      const id = (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
      db.prepare("INSERT OR REPLACE INTO email_suppressions (email, reason, provider) VALUES (?, 'bounce', 'resend')").run(email);
      const raw = `a11y-token-${scheme}-${Date.now()}`;
      db.prepare("INSERT INTO email_changes (user_id, new_email, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .run(id, `ayu.baru-${scheme}@questboard.test`, createHash("sha256").update(raw).digest("hex"), new Date(Date.now() + 3_600_000).toISOString());
      db.close();
      const found: string[] = [];
      await page.goto("/settings");
      await expect(page.getByTestId("emails-stopped")).toBeVisible();
      found.push(...(await violationsOf(page, `/settings with the bounce banner [${scheme}]`)));
      const form = page.locator("#login-email");
      await form.getByLabel("New email").fill(`ayu.other-${scheme}@questboard.test`);
      await form.getByLabel("Your password").fill("wrong password");
      await form.getByRole("button", { name: "Send confirmation link" }).click();
      await expect(form.getByText("Your current password is incorrect.")).toBeVisible();
      found.push(...(await violationsOf(page, `/settings login-email error [${scheme}]`)));
      for (const path of [`/change-email?token=${raw}`, "/change-email?token=used-or-wrong", "/change-email?taken=1"]) {
        await page.goto(path);
        found.push(...(await violationsOf(page, `${path} [${scheme}]`)));
      }
      expect(found).toEqual([]);
    });
  });
}

test("rounds 29–30 screens have no axe violations: pre-launch, invites, the pulse, QRIS, refund terms, table link", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { createHash } = await import("node:crypto");
  const sharp = (await import("sharp")).default;
  const db = e2eDb();
  const found: string[] = [];
  try {
    // A GM with refund terms, a QRIS code and a table link; a player with a seat.
    const gmEmail = `a11y-qr-${Date.now()}@questboard.test`;
    const slug = await createGmWithGame(page, "Qori QRIS", gmEmail, "A11y Table");
    await page.goto("/become-a-gm");
    await page.getByLabel(/Cancellation & refund terms/).fill("Cancel a day before for a full refund.");
    const qr = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#000000" } }).png().toBuffer();
    await page.getByLabel("QRIS code (optional)").setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: qr });
    await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
    await page.waitForURL("**/gm");
    const gameId = (db.prepare("SELECT id FROM games WHERE slug = ?").get(slug) as { id: number }).id;
    db.prepare("UPDATE games SET table_link = 'https://discord.gg/a11y-table' WHERE id = ?").run(gameId);
    await page.goto("/become-a-gm");
    found.push(...(await violationsOf(page, "/become-a-gm with a QRIS code")));

    const player = await (await browser.newContext()).newPage();
    await signup(player, "Ari Axe", `a11y-booker-${Date.now()}@questboard.test`);
    await player.goto(`/games/${slug}`);
    await player.getByRole("link", { name: "Book" }).first().click();
    await expect(player.getByTestId("refund-terms")).toBeVisible();
    found.push(...(await violationsOf(player, "/book with refund terms")));
    await player.getByRole("checkbox").check();
    await player.getByRole("button", { name: "Reserve my seat" }).click();
    await player.waitForURL("**/dashboard?booked=*");
    await player.goto(`/games/${slug}`);
    await expect(player.getByTestId("payment-qr")).toBeVisible();
    await expect(player.getByTestId("table-link")).toBeVisible();
    found.push(...(await violationsOf(player, "/games/… as a player with a seat (QRIS, table link)")));

    // An invite (valid and used-up), signed out.
    const raw = `a11y-invite-${Date.now()}`;
    db.prepare("INSERT INTO gm_invites (token_hash, note, expires_at) VALUES (?, 'a11y', ?)").run(createHash("sha256").update(raw).digest("hex"), new Date(Date.now() + 86_400_000).toISOString());
    const anon = await (await browser.newContext()).newPage();
    for (const path of [`/invite/${raw}`, "/invite/not-a-real-token"]) {
      await anon.goto(path);
      found.push(...(await violationsOf(anon, path)));
    }

    // Pre-launch mode: the banner, the opening page, a game page without booking.
    db.prepare("INSERT INTO app_state (key, value) VALUES ('prelaunch', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
    for (const path of ["/opening", `/games/${slug}`]) {
      await anon.goto(path);
      await expect(anon.getByTestId("prelaunch-banner")).toBeVisible();
      found.push(...(await violationsOf(anon, `${path} (pre-launch)`)));
    }
    await expect(anon.getByRole("link", { name: "Bookings open soon" }).first()).toBeVisible();
    await expect(anon.getByRole("link", { name: "Book", exact: true })).toHaveCount(0);

    // The admin's pages: the pre-launch card, the pulse table, the invite list.
    const admin = await (await browser.newContext()).newPage();
    await login(admin, "admin@questboard.test");
    for (const path of ["/admin", "/admin/gms"]) {
      await admin.goto(path);
      found.push(...(await violationsOf(admin, `${path} (pre-launch, invites)`)));
    }
  } finally {
    db.prepare("UPDATE app_state SET value = '0' WHERE key = 'prelaunch'").run();
    db.close();
  }
  expect(found).toEqual([]);
});

/** Raw string names on screen (a key the browser wasn't sent shows as e.g. "browse.clear"): none allowed. */
async function rawKeysOn(page: Page, label: string): Promise<string[]> {
  const { DICTIONARIES } = await import("../../src/lib/i18n/dict");
  const keys = new Set(Object.keys(DICTIONARIES.en));
  const text = await page.evaluate(() => document.body.innerText);
  return [...new Set(text.match(/\b[a-zA-Z]+\.[a-zA-Z][\w.-]*/g) ?? [])].filter((w) => keys.has(w)).map((k) => `${label} → raw string name on screen: ${k}`);
}

// Round 36: everything new since the round-33 rework, open and in use, in both schemes; and no raw string
// names anywhere (the browser now gets only the strings client code uses: lib/i18n/client-keys.ts).
test("rounds 33–36 screens have no axe violations and show no raw string names", async ({ browser }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const sharp = (await import("sharp")).default;
  for (const colorScheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ colorScheme });
    const page = await ctx.newPage();
    const check = async (label: string) => {
      problems.push(...(await violationsOf(page, `${colorScheme} ${label}`)), ...(await rawKeysOn(page, `${colorScheme} ${label}`)));
    };
    // Visitors: filter chips, the venue block, a phone with the tab bar and the filter sheet open.
    await page.goto("/games?format=one_shot&location=online&level=beginner");
    await check("filter chips");
    await page.goto("/games/panen-harapan");
    await expect(page.getByTestId("venue-maps")).toBeVisible();
    await check("venue + poster");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/games");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Filter games" })).toBeVisible();
    await check("phone: filter sheet + tab bar");
    await page.setViewportSize({ width: 1280, height: 900 });
    // The GM: account menu open, the player preview, a cover upload with its warning.
    await login(page, "gm@questboard.test");
    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await check("account menu open");
    await page.goto("/games/mercusuar-di-pulau-kabut?preview=player");
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    await check("GM preview as a player");
    await page.goto("/gm/games/new");
    const wide = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#336699" } }).png().toBuffer();
    await page.getByLabel("Or upload your own cover").setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: wide });
    await expect(page.getByTestId("cover-wide")).toBeVisible();
    await check("cover upload preview + warning");
    await page.goto("/settings");
    await check("settings");
    await page.goto("/gm");
    await check("GM dashboard numbers");
    await ctx.close();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
