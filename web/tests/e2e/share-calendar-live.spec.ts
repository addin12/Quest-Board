import { test, expect, type Page } from "@playwright/test";

// Iteration 2: WhatsApp sharing + link previews, Add to calendar, live chat refresh.

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("tavern-demo-42");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

test("game pages can be shared to WhatsApp or copied, and have a link-preview image", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/games/mercusuar-di-pulau-kabut");
  const share = page.getByRole("group", { name: "Share" });
  const wa = share.getByRole("link", { name: "WhatsApp" });
  const href = await wa.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(href!)).toContain("/games/mercusuar-di-pulau-kabut");
  expect(decodeURIComponent(href!)).toContain("Mercusuar di Pulau Kabut");
  await expect(wa).toHaveAttribute("target", "_blank");

  await share.getByRole("button", { name: "Copy link" }).click();
  await expect(share.getByRole("button", { name: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/games\/mercusuar-di-pulau-kabut$/);

  // Open Graph tags + a real PNG preview.
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Mercusuar di Pulau Kabut");
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toBeTruthy();
  const res = await page.request.get(ogImage!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect((await res.body()).length).toBeGreaterThan(5_000);
});

test("GM profiles are shareable too", async ({ page }) => {
  await page.goto("/gms/1");
  const href = await page.getByRole("group", { name: "Share" }).getByRole("link", { name: "WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(href!)).toContain("/gms/1");
});

test("booked players can add a session to their calendar (Google or .ics)", async ({ page }) => {
  await login(page, "player@questboard.test"); // Andi holds seats at Mercusuar
  await page.goto("/games/mercusuar-di-pulau-kabut");
  const cal = page.getByRole("group", { name: "Add to calendar" }).first();
  const google = await cal.getByRole("link", { name: "Google Calendar" }).getAttribute("href");
  const g = new URL(google!);
  expect(g.hostname).toBe("calendar.google.com");
  expect(g.searchParams.get("dates")).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  expect(g.searchParams.get("text")).toContain("Mercusuar di Pulau Kabut");

  const icsHref = await cal.getByRole("link", { name: /\.ics/ }).getAttribute("href");
  const res = await page.request.get(icsHref!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename=".+\.ics"/);
  const ics = await res.text();
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Mercusuar di Pulau Kabut (Call of Cthulhu)");
  expect(ics).not.toContain("GoPay"); // never payment details

  // Also on My games.
  await page.goto("/dashboard");
  await expect(page.getByRole("group", { name: "Add to calendar" }).first()).toBeVisible();
});

test("right after booking, the confirmation offers Add to calendar", async ({ page }) => {
  await login(page, "intan@questboard.test");
  // Find a table Intan hasn't booked yet (the demo data gives her some seats already).
  let title = "";
  for (const slug of ["signal-from-tartarus-station", "doskvol-setelah-gelap", "panen-harapan", "mahkota-yang-terbelah", "abomination-vaults"]) {
    await page.goto(`/games/${slug}`);
    await page.getByRole("heading", { level: 1 }).waitFor(); // the page is there before counting (count() doesn't wait)
    if (await page.getByRole("link", { name: "Book" }).count()) {
      title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
      break;
    }
  }
  expect(title).not.toBe("");
  await page.getByRole("link", { name: "Book" }).first().click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Reserve my seat" }).click();
  await page.waitForURL("**/dashboard?booked=*");
  const banner = page.getByRole("status").filter({ hasText: "You're in!" });
  await expect(banner.getByRole("group", { name: "Add to calendar" })).toBeVisible();
  const href = await banner.getByRole("link", { name: "Google Calendar" }).getAttribute("href");
  expect(new URL(href!).searchParams.get("text")).toContain(title.trim());
});

test("the .ics endpoint 404s for unknown sessions", async ({ request }) => {
  expect((await request.get("/api/sessions/999999/ics")).status()).toBe(404);
});

test("table chat updates live without reloading", async ({ browser }) => {
  test.setTimeout(90_000);
  const player = await (await browser.newContext()).newPage();
  const gm = await (await browser.newContext()).newPage();
  await login(player, "player@questboard.test");
  await login(gm, "gm@questboard.test");
  await player.goto("/games/mercusuar-di-pulau-kabut");
  await gm.goto("/games/mercusuar-di-pulau-kabut");

  // The player starts typing; a refresh must not wipe it.
  await player.getByLabel("Message").fill("half-typed draft");
  const text = `Live check ${Date.now()}`;
  await gm.getByLabel("Message").fill(text);
  await gm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(gm.getByText(text)).toBeVisible();

  await expect(player.getByText(text)).toBeVisible({ timeout: 30_000 }); // no reload
  await expect(player.getByLabel("Message")).toHaveValue("half-typed draft");
});
