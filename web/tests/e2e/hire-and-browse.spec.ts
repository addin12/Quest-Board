import { test, expect, type Page } from "@playwright/test";
import { e2eDb } from "./helpers";

// v0.9: profile settings, browse by category, hire a GM.

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

test("settings: a player changes their name and portrait", async ({ page }) => {
  await login(page, "intan@questboard.test");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByLabel("Display name").fill("Intan P.");
  await page.getByRole("radio", { name: "Portrait 3", exact: true }).check({ force: true });
  await page.getByLabel("About you").fill("Loves cozy games.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Intan P.");
  await expect(page.getByLabel("About you")).toHaveValue("Loves cozy games.");
});

test("settings: password change checks the current password", async ({ page, browser }) => {
  await login(page, "yoga@questboard.test");
  await page.goto("/settings");
  await page.getByLabel("Current password").fill("wrong-password");
  await page.getByLabel("New password").fill("newpassword456");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password is incorrect.")).toBeVisible();

  await page.getByLabel("Current password").fill("password123");
  await page.getByLabel("New password").fill("newpassword456");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await login(other, "yoga@questboard.test", "newpassword456");
});

test("browse hub lists systems, genres and styles; category pages filter games", async ({ page }) => {
  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "Game systems" })).toBeVisible();
  await page.getByRole("link", { name: /^Horror/ }).first().click();
  await expect(page).toHaveURL(/\/browse\/genre\/horror/);
  await expect(page.getByRole("heading", { level: 1, name: "Horror" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mercusuar di Pulau Kabut/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Naga/ })).toHaveCount(0);

  await page.goto("/browse/system/call-of-cthulhu");
  await expect(page.getByRole("heading", { level: 1, name: "Call of Cthulhu" })).toBeVisible();
  await expect(page.getByText(/Investigative horror/)).toBeVisible();

  const res = await page.goto("/browse/genre/not-a-genre");
  expect(res?.status()).toBe(404);
});

test("/games can filter by genre and style", async ({ page }) => {
  await page.goto("/games?genre=cyberpunk");
  await expect(page.getByRole("link", { name: /Neon/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Mercusuar/ })).toHaveCount(0);
  await page.goto("/games?style=dungeon-crawl");
  await expect(page.getByRole("link", { name: /Abomination/i }).first()).toBeVisible();
});

test("hire-a-GM directory shows GMs and filters by location", async ({ page }) => {
  await page.goto("/hire-a-gm");
  await expect(page.getByRole("heading", { level: 1, name: "Hire a Game Master" })).toBeVisible();
  await expect(page.getByText("0%").first()).toBeVisible();
  const directory = page.locator("#directory");
  await expect(directory.getByText("Raka Pradipta")).toBeVisible();
  await page.goto("/hire-a-gm?where=Bandung#directory");
  await expect(directory.getByText("Dewi Anggraini")).toBeVisible();
  await expect(directory.getByText("Raka Pradipta")).toHaveCount(0);
  await expect(page.getByText("What's the difference between a DM and a GM?")).toBeVisible();
});

test("hire flow: request → GM offer → choose → private chat with payment details", async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  const gm = await (await browser.newContext()).newPage();

  // A player posts an open request.
  await login(player, "citra@questboard.test");
  await player.goto("/hire-a-gm/request");
  await player.getByLabel("What would you like to play?").fill("Horror one-shot for our office");
  await player.getByLabel("Players in your group").fill("5");
  await player.getByLabel("When can you play?").fill("Saturday after 19.00 WIB");
  await player.getByLabel("Tell GMs about your group").fill("Five colleagues, two have played before, we like spooky mysteries.");
  await player.getByRole("button", { name: "Send request" }).click();
  await player.waitForURL(/\/hire-a-gm\/requests\/\d+/);
  await expect(player.getByText(/Request posted!/)).toBeVisible();
  const requestUrl = player.url().replace(/\?.*$/, "");

  // A GM finds it in their inbox and sends an offer.
  await login(gm, "bima@questboard.test");
  await gm.goto("/gm/requests");
  await gm.getByRole("link", { name: "Horror one-shot for our office" }).click();
  await gm.getByLabel("Your message").fill("I run Call of Cthulhu weekly — happy to do a spooky one-shot!");
  await gm.getByLabel("Your price per player per session").fill("60.000");
  await gm.getByRole("button", { name: "Send offer" }).click();
  const myOffer = gm.getByRole("region", { name: "Your offer" });
  await expect(myOffer.getByText("Rp 60.000")).toBeVisible();
  await expect(myOffer.getByText("Waiting for the group to choose a GM.")).toBeVisible();

  // The requester is notified about the offer: the bell pops out the latest notifications.
  await player.goto("/");
  const bell = player.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName(/Notifications, \d+ unread/);
  await bell.click();
  const popover = player.getByRole("region", { name: "Notifications" });
  await expect(popover.getByText("Bima Saputra sent an offer for “Horror one-shot for our office”")).toBeVisible();
  await expect(bell).toHaveAttribute("aria-expanded", "true");
  await expect(bell).toHaveAccessibleName("Notifications"); // opening marks everything read
  await player.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(bell).toBeFocused();
  // Still read after a reload; the full list is one click away.
  await player.reload();
  await expect(bell).toHaveAccessibleName("Notifications");
  await bell.click();
  await popover.getByRole("link", { name: "See all" }).click();
  await player.waitForURL("**/notifications");
  await expect(player.getByText("Bima Saputra sent an offer for “Horror one-shot for our office”")).toBeVisible();

  // Payment details stay hidden until the requester chooses.
  await player.goto(requestUrl);
  await expect(player.getByText("How to pay the GM")).toHaveCount(0);
  await expect(player.getByText("Rp 60.000")).toBeVisible();
  // A brand-new GM without a finished profile can't make offers yet.
  const newGm = await (await browser.newContext()).newPage();
  await newGm.goto("/signup");
  await newGm.getByText("Run games").click();
  await newGm.getByLabel("Display name").fill("Fresh GM");
  await newGm.getByLabel("Email").fill(`fresh-${Date.now()}@questboard.test`);
  await newGm.getByLabel("Password").fill("password123");
  await newGm.getByRole("button", { name: "Create account" }).click();
  await newGm.waitForURL("**/gm");
  await newGm.goto(requestUrl);
  await expect(newGm.getByText(/Finish your GM profile/)).toBeVisible();
  await expect(newGm.getByRole("button", { name: "Send offer" })).toHaveCount(0);

  await player.getByRole("button", { name: "Choose this GM" }).click();
  // A matched request can't be closed (that would hide the chat and payment details).
  await expect(player.getByRole("button", { name: "Close request" })).toHaveCount(0);
  await expect(player.getByText("Matched").first()).toBeVisible();
  await expect(player.getByText("How to pay the GM")).toBeVisible();
  await expect(player.getByText(/will never ask for your OTP, PIN or password/)).toBeVisible();

  // Both sides use the private chat.
  await player.getByLabel("Message").fill("Great! Does 12 October work?");
  await player.getByRole("button", { name: "Send", exact: true }).click();
  await expect(player.getByText("Great! Does 12 October work?")).toBeVisible();

  // The GM is notified that they were chosen, and about the new message (collapsed into one row).
  await gm.goto("/notifications");
  await expect(gm.getByText("Citra Ayu chose you as the GM for “Horror one-shot for our office”")).toBeVisible();
  await expect(gm.getByText("New message from Citra Ayu about “Horror one-shot for our office”")).toHaveCount(1);

  await gm.goto(requestUrl);
  await expect(gm.getByText(/You were chosen!/)).toBeVisible();
  await expect(gm.getByText("Great! Does 12 October work?")).toBeVisible();
  await gm.getByLabel("Message").fill("12 October works, see you then.");
  await gm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(gm.getByText("12 October works, see you then.")).toBeVisible();

  // An unrelated player can't see the request.
  const stranger = await (await browser.newContext()).newPage();
  await login(stranger, "fajar@questboard.test");
  const res = await stranger.goto(requestUrl);
  expect(res?.status()).toBe(404);
});

test("settings: a GM can't blank the bio their public profile needs", async ({ page }) => {
  await login(page, "nadia@questboard.test");
  await page.goto("/settings");
  await page.getByLabel("About you").fill("Too short");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Tell players about yourself in at least 30 characters.")).toBeVisible();
});

test("game form: genres are capped at three", async ({ page }) => {
  await login(page, "bima@questboard.test");
  await page.goto("/gm/games/new");
  const genres = page.getByRole("group", { name: "Genre", exact: true });
  for (const g of ["Fantasy", "Horror", "Mystery"]) await genres.getByText(g, { exact: true }).click();
  await expect(genres.getByRole("checkbox", { name: /Sci-fi/ })).toBeDisabled();
  await genres.getByText("Horror", { exact: true }).click();
  await expect(genres.getByRole("checkbox", { name: /Sci-fi/ })).toBeEnabled();
});

test("notifications: the GM hears about bookings and cancellations; players hear about cancelled sessions", async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  const gm = await (await browser.newContext()).newPage();
  await login(player, "fajar@questboard.test");
  await login(gm, "nadia@questboard.test");

  // Reserve a seat at Nadia's free one-shot → Nadia is notified.
  await player.goto("/games/starfall-salvage");
  await player.getByRole("link", { name: "Book" }).first().click();
  await player.getByRole("checkbox").check();
  await player.getByRole("button", { name: "Reserve my seat" }).click();
  await player.waitForURL("**/dashboard?booked=*");
  await gm.goto("/notifications");
  await expect(gm.getByText("Fajar Nugroho reserved a seat at Starfall Salvage")).toBeVisible();

  // Nadia cancels the session → Fajar is notified.
  await gm.goto("/gm/games/10");
  // "Cancel session" opens a panel (optional message to players), then confirms.
  const panel = gm.locator("details", { has: gm.locator("summary", { hasText: "Cancel session" }) }).first();
  await panel.locator("summary").click();
  gm.once("dialog", (d) => void d.accept());
  await panel.getByRole("button", { name: "Cancel this session" }).click();
  await expect(gm.locator("summary", { hasText: "Cancel session" })).toHaveCount(0);
  await player.goto("/notifications");
  await expect(player.getByText("The GM cancelled a session of Starfall Salvage that you had booked")).toBeVisible();
});

test("GMs who offered hear when the group chooses someone else or closes the request", async ({ browser }) => {
  const db = e2eDb();
  const id = (email: string) => (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  const [citra, bima, raka] = [id("citra@questboard.test"), id("bima@questboard.test"), id("gm@questboard.test")];
  const tag = Date.now() % 100000;
  const request = (title: string) => {
    const r = Number(db.prepare("INSERT INTO gm_requests (requester_id, title, system, group_size, schedule, details) VALUES (?, ?, 'D&D 5e (2014)', 4, 'Fridays', 'Four friends looking for a long campaign together.')").run(citra, title).lastInsertRowid);
    for (const gm of [bima, raka]) db.prepare("INSERT INTO gm_request_offers (request_id, gm_id, message, price_idr) VALUES (?, ?, 'Happy to run it!', 50000)").run(r, gm);
    return r;
  };
  const chosen = request(`Campaign ${tag}`);
  const closed = request(`One-shot ${tag}`);
  try {
    const player = await (await browser.newContext()).newPage();
    await login(player, "citra@questboard.test");
    await player.goto(`/hire-a-gm/requests/${chosen}`);
    await player.locator("li, article, div.card").filter({ hasText: "Bima Saputra" }).getByRole("button", { name: "Choose this GM" }).first().click();
    await expect(player.getByText("Chosen").first()).toBeVisible();
    await player.goto(`/hire-a-gm/requests/${closed}`);
    player.once("dialog", (d) => void d.accept());
    await player.getByRole("button", { name: "Close request" }).click();
    await expect(player.getByRole("button", { name: "Close request" })).toHaveCount(0);

    const gm = await (await browser.newContext()).newPage();
    await login(gm, "gm@questboard.test");
    await gm.goto("/notifications");
    await expect(gm.getByText(`went with another GM for “Campaign ${tag}”`)).toBeVisible();
    await expect(gm.getByText(`closed the request “One-shot ${tag}” you offered on`)).toBeVisible();
  } finally {
    db.prepare("DELETE FROM gm_requests WHERE id IN (?, ?)").run(chosen, closed);
    db.close();
  }
});
