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
  await phone.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(phone.getByRole("dialog", { name: "Filter games" })).toBeVisible();
  await phone.keyboard.press("Escape");
  await phone.goto("/games/mercusuar-di-pulau-kabut");
  await expect(phone.getByRole("link", { name: "See dates" })).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
