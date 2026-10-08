import { test, expect } from "@playwright/test";
import { bookFirstOpenSeat, createGmWithGame, login, newPage, signup, unique } from "./helpers";

// The main journeys in every engine: Chromium (the rest of the suite), and here also Firefox and
// WebKit (Safari, i.e. every browser on iPhone). See the "firefox" and "webkit" projects.
test.describe.configure({ timeout: 120_000 });

test("browse, filter, sign up, book a seat and chat", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/games");
  await page.getByLabel("Game system").selectOption("Call of Cthulhu");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/system=Call/);
  await expect(page.getByRole("region", { name: "Results" }).getByRole("heading", { level: 3 }).first()).toBeVisible();

  await signup(page, "Cross Browser", unique("xb"));
  const title = await bookFirstOpenSeat(page, ["neon-run-satu-malam-di-neo-surabaya", "starfall-salvage"]);
  await page.getByRole("link", { name: title }).first().click();
  await page.getByLabel("Message").fill("Hello from another browser!");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello from another browser!")).toBeVisible();
});

test("a GM creates a game and schedules a session (date and time input)", async ({ page, browser }) => {
  const slug = await createGmWithGame(page, "Engine GM", unique("xb-gm"), `Engine Table ${Date.now() % 100000}`);
  // A visitor sees the new session, bookable (the GM sees "Your table" instead).
  const visitor = await newPage(browser);
  await visitor.goto(`/games/${slug}`);
  await expect(visitor.getByRole("link", { name: "Book" }).first()).toBeVisible();
});

test("notification popover, toasts and the phone layout", async ({ browser }) => {
  const page = await newPage(browser);
  await login(page, "player@questboard.test");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Notifications" })).toHaveCount(0);

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await phone.goto("/games");
  // A tap in the moment before the page is ready does nothing (the language strings load separately since
  // round 32; IMPROVEMENTS P2-19): tap again until the sheet opens, as a person would.
  await expect(async () => {
    await phone.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(phone.getByRole("dialog", { name: "Filter games" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await phone.keyboard.press("Escape");
  await phone.goto("/games/mercusuar-di-pulau-kabut");
  await expect(phone.getByRole("link", { name: "See dates" })).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

// The per-request script nonce (lib/csp.ts) in every engine: no page trips the policy, signed out
// or in, and client-side navigation still loads its scripts ('strict-dynamic').
test("no page trips the Content Security Policy", async ({ browser }) => {
  test.setTimeout(240_000); // ~30 pages and three logins; WebKit on a busy machine needs more than 2 minutes
  const watch = async (page: import("@playwright/test").Page) => {
    await page.addInitScript(() => {
      const w = window as unknown as { cspViolations: string[] };
      w.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => w.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    return page;
  };
  const violations = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
  const visit = async (page: import("@playwright/test").Page, paths: string[]) => {
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await violations(page), path).toEqual([]);
    }
  };

  const anon = await watch(await newPage(browser));
  await visit(anon, ["/", "/games", "/games/mercusuar-di-pulau-kabut", "/browse", "/browse/genre/horror", "/hire-a-gm", "/gms/1", "/board", "/quiz", "/how-it-works", "/privacy", "/signup", "/forgot-password", "/feedback"]);
  // A client-side navigation fetches new scripts after the first page.
  await anon.goto("/");
  await anon.getByRole("link", { name: "Browse all games" }).first().click();
  await anon.waitForURL("**/games");
  await anon.waitForLoadState("networkidle");
  expect(await violations(anon), "client-side navigation").toEqual([]);

  for (const [email, paths] of [
    ["player@questboard.test", ["/dashboard", "/settings", "/notifications", "/hire-a-gm/request"]],
    ["gm@questboard.test", ["/gm", "/gm/games/new"]],
    ["admin@questboard.test", ["/admin", "/admin/reports", "/admin/users", "/admin/errors"]],
  ] as const) {
    const page = await watch(await newPage(browser));
    await login(page, email);
    expect(await violations(page), `${email} login`).toEqual([]);
    await visit(page, [...paths]);
  }
  // Indonesian pages too (a separate context: /id/... switches the language for the visit).
  await visit(await watch(await newPage(browser)), ["/id", "/id/games", "/id/board"]);
});
