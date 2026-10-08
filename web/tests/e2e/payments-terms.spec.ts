import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { createGmWithGame, e2eDb, login, newPage, signup, unique } from "./helpers";

// Round 30: refund terms before booking; the online table's link and the GM's QRIS code for booked players only.
test("refund terms show before booking; the table link and the QRIS code only to players with a seat", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const gmEmail = unique("terms-gm");
  const slug = await createGmWithGame(page, "Tara Terms", gmEmail, "Terms Table");
  const db = e2eDb();
  const gmId = (db.prepare("SELECT id FROM users WHERE email = ?").get(gmEmail) as { id: number }).id;
  const gameId = (db.prepare("SELECT id FROM games WHERE slug = ?").get(slug) as { id: number }).id;

  // The GM writes refund terms and adds a QRIS code: a payment change (they had bank details), so they're emailed.
  await page.goto("/become-a-gm");
  await page.getByLabel(/Cancellation & refund terms/).fill("Cancel 24 hours before for a full refund.");
  const qr = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000000" } }).png().toBuffer();
  await page.getByLabel("QRIS code (optional)").setInputFiles({ name: "qris.png", mimeType: "image/png", buffer: qr });
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");
  expect(db.prepare("SELECT COUNT(*) AS n FROM payment_changes WHERE user_id = ?").get(gmId)).toEqual({ n: 1 });
  const mail = db.prepare("SELECT body_text FROM email_outbox WHERE to_address = ? AND subject LIKE '%payment details%' ORDER BY id DESC").get(gmEmail) as { body_text: string };
  expect(mail.body_text).toContain("QRIS code: a new picture");
  const qrPath = (db.prepare("SELECT payment_qr FROM gm_profiles WHERE user_id = ?").get(gmId) as { payment_qr: string }).payment_qr;
  expect(qrPath).toMatch(/^\/uploads\/[0-9a-f]{32}\.webp$/);

  // The table link: only https.
  await page.goto(`/gm/games/${gameId}/edit`);
  await page.getByLabel("Link to the table (optional)").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter a full link starting with https://")).toBeVisible();
  await page.getByLabel("Link to the table (optional)").fill("https://discord.gg/terms-table");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);

  // A visitor sees the refund terms, not the link or the code (nor can they fetch it, in any way).
  const visitor = await newPage(browser);
  await visitor.goto(`/games/${slug}`);
  await expect(visitor.getByTestId("refund-terms")).toContainText("Cancel 24 hours before for a full refund.");
  await expect(visitor.getByTestId("table-link")).toHaveCount(0);
  expect((await visitor.request.get(`/payment-qr/${gmId}`)).status()).toBe(404);
  expect((await visitor.request.get(qrPath)).status()).toBe(404); // never through /uploads
  await login(visitor, "player@questboard.test"); // signed in, but no seat at this GM's games
  expect((await visitor.request.get(`/payment-qr/${gmId}`)).status()).toBe(404);

  // A player sees the terms on the booking page, books, then sees the link and the code.
  const player = await newPage(browser);
  await signup(player, "Pia Payer", unique("terms-p"));
  await player.goto(`/games/${slug}`);
  await player.getByRole("link", { name: "Book" }).first().click();
  await expect(player.getByTestId("refund-terms")).toContainText("Cancel 24 hours before for a full refund.");
  await player.getByRole("checkbox").check();
  await player.getByRole("button", { name: "Reserve my seat" }).click();
  await player.waitForURL("**/dashboard?booked=*");
  await player.goto(`/games/${slug}`);
  await expect(player.getByTestId("table-link").getByRole("link", { name: "https://discord.gg/terms-table" })).toBeVisible();
  await expect(player.getByTestId("payment-qr")).toBeVisible();
  const img = await player.request.get(`/payment-qr/${gmId}`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/webp");
  expect(img.headers()["cache-control"]).toContain("no-store");
  db.close();
});

// Round 32: a GM sees their own game the way players will, before anyone books.
test("'See it as a player': the GM previews their page as a visitor and as a player with a seat; nothing in it acts", async ({ page }) => {
  test.setTimeout(150_000);
  const gmEmail = unique("preview-gm");
  const slug = await createGmWithGame(page, "Pram Preview", gmEmail, "Preview Table");
  const db = e2eDb();
  const gameId = (db.prepare("SELECT id FROM games WHERE slug = ?").get(slug) as { id: number }).id;
  await page.goto("/become-a-gm");
  const qr = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000000" } }).png().toBuffer();
  await page.getByLabel("QRIS code (optional)").setInputFiles({ name: "qris.png", mimeType: "image/png", buffer: qr });
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");
  await page.goto(`/gm/games/${gameId}/edit`);
  await page.getByLabel("Link to the table (optional)").fill("https://discord.gg/preview-table");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);

  // From the manage page: as a player with a seat — how to pay (bank and QRIS), the table link, "Booked".
  await page.getByRole("link", { name: "See it as a player" }).click();
  await page.waitForURL(`**/games/${slug}?preview=player`);
  await expect(page.getByTestId("preview-banner")).toContainText("as a player with a seat sees it");
  await expect(page.getByText("BCA 000-111-222")).toBeVisible();
  await expect(page.getByTestId("payment-qr")).toBeVisible();
  expect(await page.getByTestId("payment-qr").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByTestId("table-link").getByRole("link", { name: "https://discord.gg/preview-table" })).toBeVisible();
  await expect(page.locator("#sessions").getByText("Booked")).toBeVisible();
  // Not the GM's own tools, not the real chat, no report buttons.
  await expect(page.getByRole("link", { name: "Manage game" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Table chat" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Report" })).toHaveCount(0);

  // As a visitor: no payment details or link; Book is shown but does nothing.
  await page.getByTestId("preview-banner").getByRole("link", { name: "As a visitor" }).click();
  await page.waitForURL(`**/games/${slug}?preview=visitor`);
  await expect(page.getByText("BCA 000-111-222")).toHaveCount(0);
  await expect(page.getByTestId("table-link")).toHaveCount(0);
  await expect(page.getByTestId("payment-qr")).toHaveCount(0);
  const book = page.locator("#sessions").getByText("Book", { exact: true });
  await expect(book).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#sessions").getByRole("link", { name: "Book" })).toHaveCount(0);

  // Back to the GM's own view.
  await page.getByTestId("preview-banner").getByRole("link", { name: "Back to my view" }).click();
  await expect(page.getByRole("link", { name: "Manage game" })).toBeVisible();
  await expect(page.getByTestId("preview-banner")).toHaveCount(0);

  // Only the GM: anyone else adding ?preview gets the ordinary page.
  await page.context().clearCookies();
  await page.goto(`/games/${slug}?preview=player`);
  await expect(page.getByTestId("preview-banner")).toHaveCount(0);
  await expect(page.getByText("BCA 000-111-222")).toHaveCount(0);
  db.close();
});

test("an invite can be emailed: one email, in both languages, with the link", async ({ page }) => {
  await login(page, "admin@questboard.test");
  await page.goto("/admin/gms");
  const to = unique("invite-mail");
  await page.getByLabel("Email it to (optional)").fill(to);
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(page.getByText(`Emailed to ${to}.`)).toBeVisible();
  const link = await page.getByTestId("invite-link").inputValue();
  const db = e2eDb();
  const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE to_address = ?").get(to) as { subject: string; body_text: string };
  db.close();
  expect(mail.subject).toBe("You're invited to Quest Board as a founding GM / Kamu diundang ke Quest Board sebagai GM pendiri");
  expect(mail.body_text).toContain(link); // the dev outbox keeps it (on a real server the stored copy is blanked)
  expect(mail.body_text).toContain("Terima di sini");
});

test("hire a GM: the requester who chose a GM sees their QRIS code; nobody else does", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const gmEmail = unique("hire-qr-gm");
  await createGmWithGame(page, "Hana Hire", gmEmail, "Hire QR Table");
  await page.goto("/become-a-gm");
  const qr = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#000000" } }).png().toBuffer();
  await page.getByLabel("QRIS code (optional)").setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: qr });
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");

  const requester = await newPage(browser);
  const reqEmail = unique("hire-qr-req");
  await signup(requester, "Rina Requester", reqEmail);
  const db = e2eDb();
  const gmId = (db.prepare("SELECT id FROM users WHERE email = ?").get(gmEmail) as { id: number }).id;
  const reqId = (db.prepare("SELECT id FROM users WHERE email = ?").get(reqEmail) as { id: number }).id;
  // A request where this GM's offer was chosen.
  const requestId = Number(db.prepare("INSERT INTO gm_requests (requester_id, title, group_size, status, matched_gm_id) VALUES (?, 'A one-shot for four friends', 4, 'matched', ?)").run(reqId, gmId).lastInsertRowid);
  db.prepare("INSERT INTO gm_request_offers (request_id, gm_id, message, price_idr) VALUES (?, ?, 'I can run it on Saturday.', 0)").run(requestId, gmId);
  db.close();

  await requester.goto(`/hire-a-gm/requests/${requestId}`);
  await expect(requester.getByRole("img", { name: /The GM's QRIS code/ })).toBeVisible();
  expect((await requester.request.get(`/payment-qr/${gmId}`)).status()).toBe(200);
  const stranger = await newPage(browser);
  await signup(stranger, "Sari Stranger", unique("hire-qr-x"));
  expect((await stranger.request.get(`/payment-qr/${gmId}`)).status()).toBe(404);
});

// Feedback 2026-10-07: an in-person game names its venue and links it on Google Maps (public).
test("an in-person game shows its venue and an 'Open in Google Maps' button; only Google Maps links are accepted", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const slug = await createGmWithGame(page, "Vina Venue", unique("venue-gm"), "Venue Table");
  const db = e2eDb();
  const gameId = (db.prepare("SELECT id FROM games WHERE slug = ?").get(slug) as { id: number }).id;
  db.close();
  await page.goto(`/gm/games/${gameId}/edit`);
  await page.getByLabel("Location").selectOption("in_person");
  await page.locator("#city").fill("Bandung");
  await page.getByLabel("Venue (optional)").fill("Kumu Ground Coffee");
  await page.getByLabel("Google Maps link (optional)").fill("https://bit.ly/not-a-map");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Paste a Google Maps link")).toBeVisible();
  await page.getByLabel("Google Maps link (optional)").fill("https://maps.app.goo.gl/KumuGroundCoffee");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);

  // Anyone (signed out) sees the venue and the map link.
  const visitor = await newPage(browser);
  await visitor.goto(`/games/${slug}`);
  await expect(visitor.getByText("Kumu Ground Coffee")).toBeVisible();
  const maps = visitor.getByTestId("venue-maps");
  await expect(maps).toHaveAttribute("href", "https://maps.app.goo.gl/KumuGroundCoffee");
  await expect(maps).toHaveAttribute("target", "_blank");
  await expect(maps).toHaveAttribute("rel", /noopener/);
  await expect(maps).toHaveText(/Open in Google Maps/);
});
