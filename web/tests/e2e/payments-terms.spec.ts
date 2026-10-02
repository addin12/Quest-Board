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
