import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
  const panel = page.locator("details", { has: page.locator("summary", { hasText: "Cancel session" }) }).last();
  await panel.locator("summary").click();
  page.once("dialog", (d) => void d.accept());
  await panel.getByRole("button", { name: "Cancel this session" }).click();
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

  test("a game page keeps a booking bar in reach that jumps to the dates", async ({ page }) => {
    await page.goto("/games/mercusuar-di-pulau-kabut");
    const cta = page.getByRole("link", { name: "See dates" });
    await expect(cta).toBeVisible();
    await expect(page.getByText(/\d+ upcoming sessions?/).first()).toBeVisible();
    // Pinned above the tab bar, not under it.
    const bar = (await cta.boundingBox())!;
    const tabs = (await page.getByRole("navigation", { name: "Sections" }).boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(tabs.y + 1);
    await cta.click();
    await expect(page).toHaveURL(/#sessions$/);
    await expect(page.locator("#sessions").getByRole("link", { name: "Book", exact: true }).first()).toBeInViewport();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    // Fits a 320px phone.
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    // The GM of the game doesn't get a booking bar.
    await login(page, "gm@questboard.test");
    await page.goto("/games/mercusuar-di-pulau-kabut");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "See dates" })).toHaveCount(0);
  });
});

for (const width of [1280, 360]) {
  test(`the notification popover wraps long text, with no sideways scrollbar (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, "player@questboard.test");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const list = page.getByRole("region", { name: "Notifications" }).locator("ul");
    await expect(list.locator("li").first()).toBeVisible();
    const { scroll, client, lines, chars } = await list.evaluate((el) => {
      // The longest notification text (other tests may have added newer, shorter ones).
      const texts = [...el.querySelectorAll("li a span span:first-child")] as HTMLElement[];
      const text = texts.sort((a, b) => (b.textContent ?? "").length - (a.textContent ?? "").length)[0];
      return {
        scroll: el.scrollWidth, client: el.clientWidth, chars: (text.textContent ?? "").length,
        lines: Math.round(text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight)),
      };
    });
    expect(scroll).toBeLessThanOrEqual(client);
    expect(chars).toBeGreaterThan(60); // the demo "How was …? Leave a review…" prompt
    expect(lines).toBeGreaterThan(1); // …wraps instead of running off
  });
}

test("a new player with no bookings gets a welcome panel; a player with bookings doesn't", async ({ page }) => {
  await signup(page, "Fresh Player", unique("welcome"));
  const welcome = page.getByRole("region", { name: "Welcome to the tavern!" });
  await expect(welcome).toBeVisible();
  await welcome.getByRole("link", { name: "Beginner-friendly games" }).click();
  await expect(page).toHaveURL(/\/games\?level=beginner$/);
  await page.context().clearCookies();
  await login(page, "player@questboard.test");
  await expect(page.getByRole("region", { name: "Welcome to the tavern!" })).toHaveCount(0);
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
  // Andi has sessions this month or next (demo sessions are a few days ahead, so near the
  // end of a month they fall in the next one).
  if ((await cal.getByRole("link").count()) === 0) {
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.locator("table").first().getByRole("link").first()).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
  } else {
    await expect(cal.getByRole("link").first()).toBeVisible();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
  }
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
