import { test, expect, type Page } from "@playwright/test";
import { confirmSignup } from "./helpers";

// Journeys run in English (browser locale en-US) unless a test opts into Indonesian.

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("English by default", () => {
  // Even an Indonesian browser gets English until the visitor picks ID.
  test.use({ locale: "id-ID" });

  test("first visit is English; the switcher changes to Bahasa Indonesia and persists", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: /Find your table/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "en", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "id", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Temukan table-mu/ })).toBeVisible();
    await page.goto("/games");
    await expect(page.getByRole("heading", { name: "Cari game" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "id");

    await page.getByRole("button", { name: "en", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Find a game" })).toBeVisible();
  });

  test("prices are shown in Rupiah; free games say Free, or Gratis in Indonesian", async ({ page }) => {
    await page.goto("/games?system=Call+of+Cthulhu");
    await expect(page.getByText("Rp 75.000").first()).toBeVisible();
    await page.goto("/games?free=1");
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "id", exact: true }).click();
    await expect(page.getByText("Gratis", { exact: true }).first()).toBeVisible();
  });
});

test("anonymous visitor can browse, filter and open a game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find your table/ })).toBeVisible();

  await page.goto("/games?system=Call+of+Cthulhu");
  await expect(page.getByRole("link", { name: /Mercusuar di Pulau Kabut/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Naga-naga Hutan Bara/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Mercusuar di Pulau Kabut/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mercusuar di Pulau Kabut" })).toBeVisible();
  await expect(page.getByText("Tenggelam, body horror, isolasi")).toBeVisible();
  await expect(page.getByText("Paid directly to the GM · 0% commission")).toBeVisible();
  // Table chat and GM payment details are private to members.
  await expect(page.getByRole("heading", { name: "Table chat" })).toHaveCount(0);
  await expect(page.getByText("How to pay the GM")).toHaveCount(0);
});

test("play-language filter includes bilingual tables", async ({ page }) => {
  await page.goto("/games?language=en");
  await expect(page.getByRole("link", { name: /Signal from Tartarus Station/ })).toBeVisible(); // English
  await expect(page.getByRole("link", { name: /Mahkota yang Terbelah/ })).toBeVisible(); // both
  await expect(page.getByRole("link", { name: /Mercusuar di Pulau Kabut/ })).toHaveCount(0); // Indonesian only
});

test("D&D editions are separate systems", async ({ page }) => {
  await page.goto("/games?system=" + encodeURIComponent("D&D 5.5e (2024)"));
  await expect(page.getByRole("link", { name: /Naga-naga Hutan Bara/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mahkota yang Terbelah/ })).toHaveCount(0);
  await page.goto("/games?system=" + encodeURIComponent("D&D 5e (2014)"));
  await expect(page.getByRole("link", { name: /Mahkota yang Terbelah/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Naga-naga Hutan Bara/ })).toHaveCount(0);
  // Keyword search still finds both editions.
  await page.goto("/games?q=D%26D");
  await expect(page.getByRole("link", { name: /Naga-naga Hutan Bara/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mahkota yang Terbelah/ })).toBeVisible();
});

test("Flaticon icons render and are credited", async ({ page }) => {
  await page.goto("/");
  const icon = page.locator("header i.fi-sr-dice-d20").first();
  await expect(icon).toBeVisible();
  const family = await icon.evaluate((el) => getComputedStyle(el, "::before").fontFamily);
  expect(family).toContain("qb-uicons-sr");
  await expect(page.getByRole("link", { name: "Uicons by Flaticon" })).toHaveAttribute("href", "https://www.flaticon.com/uicons");
});

test("protected pages redirect to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await page.goto("/gm");
  await expect(page).toHaveURL(/\/login/);
});

test("player reserves a seat (no payment step), sees GM payment details, chats, then cancels", async ({ page }) => {
  await login(page, "player@questboard.test");
  await page.goto("/games/neon-run-satu-malam-di-neo-surabaya"); // paid game; the demo player has no seat here yet
  await page.getByRole("link", { name: "Book" }).first().click();
  await expect(page.getByRole("heading", { name: "Reserve your seat" })).toBeVisible();
  await expect(page.getByText(/You pay Rp 80.000 directly to the GM/)).toBeVisible();
  await expect(page.getByLabel(/card/i)).toHaveCount(0);

  // Must accept the table rules.
  await page.getByRole("button", { name: "Reserve my seat" }).click();
  await expect(page).toHaveURL(/\/book\//); // native `required` blocks submission
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Reserve my seat" }).click();

  await page.waitForURL("**/dashboard?booked=*");
  await expect(page.getByText("You're in!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Neon Run: Satu Malam di Neo-Surabaya" })).toBeVisible();

  // Now a member: payment details and table chat are visible.
  await page.goto("/games/neon-run-satu-malam-di-neo-surabaya");
  await expect(page.getByText("Booked", { exact: true })).toBeVisible();
  await expect(page.getByText("How to pay the GM")).toBeVisible();
  await expect(page.getByText(/Mandiri 987-654-3210/)).toBeVisible();
  await page.getByLabel("Message").fill("Halo dari tes e2e!");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Halo dari tes e2e!")).toBeVisible();

  // Cancel.
  await page.goto("/dashboard");
  page.once("dialog", (d) => d.accept());
  const row = page.locator(".card", { has: page.getByRole("link", { name: "Neon Run: Satu Malam di Neo-Surabaya" }) }).first();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cancelled by you")).toBeVisible();
});

test("player can review a game they have played", async ({ page }) => {
  await login(page, "player@questboard.test");
  await page.goto("/games/mercusuar-di-pulau-kabut");
  await expect(page.getByText("How was your game?")).toBeVisible();
  await page.locator('label:has(input[name="rating"][value="5"])').click();
  await page.getByRole("textbox", { name: "Review" }).fill("Seram dan seru. E2E approved.");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Thanks for reviewing this game")).toBeVisible();
  await expect(page.locator("p", { hasText: "Seram dan seru. E2E approved." })).toBeVisible(); // (the edit form's textarea holds it too)
  await expect(page.getByText("How was your game?")).toHaveCount(0); // one review per game

  // The reviewer can edit it (marked "edited")…
  const mine = page.getByRole("region", { name: /Reviews/ }).getByRole("listitem").filter({ hasText: "Seram dan seru. E2E approved." });
  await mine.getByText("Edit your review").click();
  await mine.locator('label:has(input[name="rating"][value="4"])').click();
  await mine.getByRole("textbox", { name: "Review" }).fill("Seram, seru, sedikit panjang. E2E edited.");
  await mine.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your review was updated.")).toBeVisible();
  const edited = page.getByRole("region", { name: /Reviews/ }).getByRole("listitem").filter({ hasText: "E2E edited." });
  await expect(edited.getByText("edited", { exact: false }).first()).toBeVisible();
  await expect(edited.getByRole("img", { name: /4/ })).toBeVisible();

  // …or delete it, and then write a new one.
  await edited.getByText("Edit your review").click();
  page.once("dialog", (d) => void d.accept());
  await edited.getByRole("button", { name: "Delete review" }).click();
  await expect(page.getByText("Your review was deleted.")).toBeVisible();
  await expect(page.getByText("E2E edited.")).toHaveCount(0);
  await expect(page.getByText("How was your game?")).toBeVisible();
  await page.locator('label:has(input[name="rating"][value="5"])').click();
  await page.getByRole("textbox", { name: "Review" }).fill("Seram dan seru. E2E approved.");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Thanks for reviewing this game")).toBeVisible();
});

test("new GM signs up, sets payment details, lists a game in Rupiah and it appears in search", async ({ page }) => {
  const email = `newgm-${Date.now()}@questboard.test`;
  await page.goto("/signup");
  await page.getByText("Run games").click();
  await page.getByLabel("Display name").fill("Nova Quill");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await confirmSignup(page, email, true);
  await expect(page.getByRole("heading", { name: "GM dashboard" })).toBeVisible();

  await page.getByRole("link", { name: /Edit profile & payment details/ }).click();
  await page.getByLabel("Headline").fill("Dungeon crawl taktis");
  await page.getByLabel("About you").fill("GM dari Jakarta yang suka dungeon penuh jebakan dan teka-teki.");
  await expect(page.getByLabel("Timezone")).toHaveCount(0); // replaced by Location
  await page.getByLabel("Location").fill("online");
  await page.getByLabel(/How players pay you/).fill("GoPay 0812-9999-0000");
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");

  await page.getByRole("link", { name: "New game" }).click();
  await page.getByLabel("Title").fill("");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();

  await page.getByLabel("Title").fill("Makam Santo Jam Mekanik");
  await page.getByLabel("Game system").fill("Pathfinder 2e");
  await page.getByLabel("One-line summary").fill("Dungeon crawl penuh roda gigi untuk pahlawan pemula.");
  await page.getByLabel("Full description").fill("Jauh di bawah kota, seorang santo mekanik terus berdetak. Bisakah party kalian menghentikannya sebelum tengah malam?");
  await page.getByLabel("Platform(s)").fill("Discord + Foundry VTT");
  await page.getByLabel(/Price per seat/).fill("75.000");
  await page.getByRole("button", { name: "Create game" }).click();

  await page.waitForURL(/\/gm\/games\/\d+$/);
  await expect(page.getByRole("heading", { name: "Makam Santo Jam Mekanik" })).toBeVisible();
  await expect(page.getByText(/Rp 75\.000 per seat · you keep 100%/)).toBeVisible();

  const future = new Date(Date.now() + 5 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T19:00`;
  await page.getByLabel(/Date & time/).fill(local);
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(page.getByText("Session added.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Upcoming sessions \(1\)/ })).toBeVisible();

  await page.goto("/games?q=Mekanik");
  await expect(page.getByRole("link", { name: /Makam Santo Jam Mekanik/ })).toBeVisible();
});

test("a player cannot open the GM dashboard", async ({ page }) => {
  await login(page, "player@questboard.test");
  await page.goto("/gm");
  await expect(page).toHaveURL(/\/become-a-gm/);
});

test("public JSON API lists and describes games in IDR, without GM payment details", async ({ request }) => {
  const list = await request.get("/api/games?system=Mothership");
  expect(list.ok()).toBeTruthy();
  const body = await list.json();
  expect(body.count).toBeGreaterThan(0);
  expect(body.data[0]).toMatchObject({ system: "Mothership", language: "en", price: { amount: 60000, currency: "IDR" }, gm: { name: "Raka Pradipta" } });

  const detail = await request.get(`/api/games/${body.data[0].slug}`);
  const text = await detail.text();
  expect(Array.isArray(JSON.parse(text).data.sessions)).toBeTruthy();
  expect(text).not.toContain("BCA");

  const missing = await request.get("/api/games/does-not-exist");
  expect(missing.status()).toBe(404);
});

test("GM profiles show a location — a city, or Online for online-only GMs", async ({ page }) => {
  await page.goto("/games/mercusuar-di-pulau-kabut");
  await page.getByRole("link", { name: /Raka Pradipta/ }).first().click();
  await expect(page.getByText("Location: Jakarta")).toBeVisible();
  await expect(page.getByText(/Timezone/)).toHaveCount(0);

  await page.goto("/games/doskvol-setelah-gelap");
  await page.getByRole("link", { name: /Bima Saputra/ }).first().click();
  await expect(page.getByText("Location: Online")).toBeVisible();
});

test("demo games show cover art and GMs show portraits (and the images load)", async ({ page }) => {
  await page.goto("/games/mercusuar-di-pulau-kabut");
  const cover = page.locator('img[src*="/images/covers/mercusuar-di-pulau-kabut.svg"]').first();
  await expect(cover).toBeVisible();
  expect(await cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const portrait = page.locator('img[src*="/images/gms/raka.svg"]').first();
  await expect(portrait).toBeVisible();
  expect(await portrait.evaluate((img: HTMLImageElement) => img.naturalWidth > 0)).toBe(true);

  const api = await (await page.request.get("/api/games/mercusuar-di-pulau-kabut")).json();
  expect(api.data.coverImage).toBe("/images/covers/mercusuar-di-pulau-kabut.svg");
});

test("a GM can pick a cover illustration for their own game, and change it later", async ({ page }) => {
  await login(page, "nadia@questboard.test");
  await page.goto("/gm/games/new");
  await page.getByLabel("Title").fill("Kuil Seribu Pintu");
  await page.getByLabel("Game system").fill("Pathfinder 2e");
  await page.getByLabel("One-line summary").fill("Eksplorasi kuil kuno penuh pintu rahasia.");
  await page.getByLabel("Full description").fill("Setiap pintu di kuil ini membuka ke tempat yang berbeda. Temukan pintu yang benar sebelum fajar.");
  await page.getByLabel("Platform(s)").fill("Foundry VTT");

  const neon = page.getByRole("radio", { name: "Neon city" });
  await expect(page.getByRole("radio", { name: "Colour gradient" })).toBeChecked(); // default
  await page.getByText("Neon city", { exact: true }).click();
  await expect(neon).toBeChecked();
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);

  await page.getByRole("link", { name: "View listing" }).click();
  await expect(page.locator('img[src*="/images/covers/library/neon-city.svg"]').first()).toBeVisible();

  // Edit: the current choice is pre-selected; switch to another illustration.
  await page.getByRole("link", { name: "Manage game" }).click();
  await page.getByRole("link", { name: "Edit details" }).click();
  await expect(page.getByRole("radio", { name: "Neon city" })).toBeChecked();
  await page.getByText("Dungeon gate", { exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);
  await page.goto("/games?q=Kuil");
  await expect(page.locator('img[src*="/images/covers/library/dungeon.svg"]').first()).toBeVisible();
});

test("a GM can pick an illustrated portrait instead of initials", async ({ page }) => {
  await page.goto("/signup");
  await page.getByText("Run games").click();
  await page.getByLabel("Display name").fill("Laras Wibisono");
  const larasEmail = `laras-${Date.now()}@questboard.test`;
  await page.getByLabel("Email").fill(larasEmail);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await confirmSignup(page, larasEmail, true);

  await page.getByRole("link", { name: /Edit profile & payment details/ }).click();
  await expect(page.getByRole("radio", { name: "Initials" })).toBeChecked(); // default for new GMs
  await page.getByRole("radio", { name: "Portrait 1", exact: true }).check({ force: true });
  // Live preview updates before saving.
  await expect(page.locator('img[src*="/images/gms/library/wizard-violet.svg"]').first()).toBeVisible();
  await page.getByLabel("Headline").fill("Petualangan high fantasy klasik");
  await page.getByLabel("About you").fill("GM dari Semarang yang suka naga, sihir, dan cerita heroik klasik.");
  await page.getByLabel("Location").fill("Semarang");
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");

  // Header avatar and public profile use the portrait.
  await expect(page.locator('header img[src*="/images/gms/library/wizard-violet.svg"]')).toBeVisible();
  await page.getByRole("link", { name: "View public profile" }).click();
  await expect(page.getByRole("heading", { name: /Laras Wibisono/ })).toBeVisible();
  await expect(page.locator('img[src*="/images/gms/library/wizard-violet.svg"]').first()).toBeVisible();
});
