import { test, expect } from "@playwright/test";
import { login, newPage, signup, unique } from "./helpers";

// Iteration 7: UI/UX polish.

test("theme switch cycles Automatic → Parchment → Candlelight and is remembered", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  const toggle = page.getByRole("button", { name: /^Theme: Automatic/ });
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: /^Theme: Parchment/ }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  // The explicit choice wins over the OS preference.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(22, 16, 10)");
  await page.getByRole("button", { name: /^Theme: Candlelight/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});

test.describe("dark OS preference", () => {
  test.use({ colorScheme: "dark" });
  test("choosing Parchment overrides a dark device", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(22, 16, 10)");
    await page.getByRole("button", { name: /^Theme: Automatic/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(239, 227, 200)");
  });
});

test("quick actions confirm with a toast that shows once", async ({ page }) => {
  await signup(page, "Tia Toast", unique("toast"));
  await page.goto("/games/mahkota-yang-terbelah"); // panen-harapan is archived by hardening P1-2
  await page.getByRole("button", { name: "Save" }).click();
  const toast = page.getByRole("status").filter({ hasText: "Saved to My games." });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Saved to My games.")).toHaveCount(0); // not repeated
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByText("Removed from saved games.")).toBeVisible();
});

test("a GM cancelling a session gets a toast", async ({ browser }) => {
  const page = await newPage(browser);
  await login(page, "nadia@questboard.test");
  await page.goto("/gm");
  await page.getByRole("link", { name: "Manage" }).first().click();
  const future = new Date(Date.now() + 20 * 86_400_000);
  await page.getByLabel(/Date & time/).fill(new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(page.getByText("Session added.")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Cancel session" }).last().click();
  await expect(page.getByText("Session cancelled. Booked players have been notified.")).toBeVisible();
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("filters open in a bottom sheet and show how many are active", async ({ page }) => {
    await page.goto("/games");
    const button = page.getByRole("button", { name: "Filters", exact: true });
    await expect(button).toBeVisible();
    await expect(page.getByLabel("Game system")).toBeHidden();
    await button.click();
    const sheet = page.getByRole("dialog", { name: "Filter games" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Game system").selectOption("Call of Cthulhu");
    await sheet.getByRole("button", { name: "Apply" }).click();
    await page.waitForURL(/system=Call/);
    await expect(page.getByRole("button", { name: "Filters (1 active)" })).toBeVisible();
    await page.getByRole("button", { name: "Filters (1 active)" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Filter games" })).toHaveCount(0);
  });
});

test("desktop keeps filters inline", async ({ page }) => {
  await page.goto("/games");
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeHidden();
  await expect(page.getByLabel("Game system")).toBeVisible();
});

test("the adventurer quiz suggests tables and says what it relaxed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Take the 1-minute quiz/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What kind of adventurer are you?" })).toBeVisible();
  await page.getByLabel("Spooky mysteries").check();
  await page.getByLabel("Online").check();
  await page.getByLabel("Doesn't matter").check();
  await page.getByLabel("Never played").check();
  await page.getByRole("button", { name: "Show my tables" }).click();
  await expect(page.getByRole("heading", { name: "The Investigator" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Signal from Tartarus Station/ })).toBeVisible(); // online, beginner, horror
  // A combination nothing matches exactly → relaxed and says so.
  await page.goto("/quiz?mood=cozy&where=in_person&budget=free&experience=veteran");
  await expect(page.getByText(/Nothing matched everything, so we relaxed:/)).toBeVisible();
  // Half-finished answers ask for the rest.
  await page.goto("/quiz?mood=cozy");
  await expect(page.getByText("Please answer all four questions.")).toBeVisible();
});

test("My games has a calendar view", async ({ page }) => {
  await login(page, "player@questboard.test");
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await page.waitForURL("**/dashboard?view=calendar");
  const cal = page.locator("table").first();
  await expect(cal).toBeVisible();
  await expect(cal.getByRole("link").first()).toBeVisible(); // Andi has sessions this month or next
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Upcoming \(/ })).toBeVisible();
});

test("404s and empty states have tavern art", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Natural 1." })).toBeVisible();
  await expect(page.locator('img[src*="natural-one"]')).toBeVisible();
  await page.goto("/games?q=zzznothingmatches");
  await expect(page.locator('img[src*="empty-tankard"]')).toBeVisible();
});
