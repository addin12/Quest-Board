import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { createGmWithGame, e2eDb, login, newPage, signup, unique } from "./helpers";

// Uploaded covers and portraits: shown everywhere, checked and re-encoded, never someone else's.
test.describe.configure({ timeout: 120_000 });

const picture = (r: number, g: number, b: number) =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: { r, g, b } } }).png().toBuffer();

test("a GM uploads a cover and a player uploads a portrait; both show and are served as WebP", async ({ page, browser }) => {
  const title = `Upload Table ${Date.now() % 100000}`;
  const slug = await createGmWithGame(page, "Uma Uploads", unique("upload-gm"), title);
  const manage = page.url();
  await page.goto(`${manage}/edit`);
  await page.getByLabel("Or upload your own cover").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: await picture(30, 90, 160) });
  await expect(page.getByText("This picture will be used when you save.")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);

  const db = e2eDb();
  const { cover_image } = db.prepare("SELECT cover_image FROM games WHERE slug = ?").get(slug) as { cover_image: string };
  expect(cover_image).toMatch(/^\/uploads\/[a-f0-9]{32}\.webp$/);
  const res = await page.request.get(cover_image);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/webp");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  // The public game page shows it (through Next's image optimiser).
  const visitor = await newPage(browser);
  await visitor.goto(`/games/${slug}`);
  await expect(visitor.locator(`img[src*="${encodeURIComponent(cover_image)}"]`).first()).toBeVisible();

  // A player's own picture, from Settings.
  const player = await newPage(browser);
  const email = unique("upload-player");
  await signup(player, "Pia Picture", email);
  await player.goto("/settings");
  await player.getByLabel("Or upload your own picture").setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await sharp(await picture(160, 60, 60)).jpeg().toBuffer() });
  await player.getByRole("button", { name: "Save profile" }).click();
  await expect(player.getByText("Profile saved.")).toBeVisible();
  const { avatar_image } = db.prepare("SELECT avatar_image FROM users WHERE email = ?").get(email) as { avatar_image: string };
  expect(avatar_image).toMatch(/^\/uploads\/[a-f0-9]{32}\.webp$/);

  // Replacing the cover deletes the old file.
  await page.goto(`${manage}/edit`);
  await page.getByLabel("Or upload your own cover").setInputFiles({ name: "cover2.png", mimeType: "image/png", buffer: await picture(40, 140, 60) });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);
  expect((await page.request.get(cover_image)).status()).toBe(404);
  db.close();
});

test("fake pictures are refused, and nobody can use someone else's upload", async ({ page, browser }) => {
  const owner = await newPage(browser);
  const ownerEmail = unique("pic-owner");
  await signup(owner, "Otto Owner", ownerEmail);
  await owner.goto("/settings");
  await owner.getByLabel("Or upload your own picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: await picture(10, 10, 200) });
  await owner.getByRole("button", { name: "Save profile" }).click();
  await expect(owner.getByText("Profile saved.")).toBeVisible();
  const db = e2eDb();
  const theirs = (db.prepare("SELECT avatar_image FROM users WHERE email = ?").get(ownerEmail) as { avatar_image: string }).avatar_image;

  const email = unique("pic-thief");
  await signup(page, "Tina Thief", email);
  await page.goto("/settings");
  // A text file dressed up as a picture.
  await page.getByLabel("Or upload your own picture").setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>") });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("That file isn't a JPEG, PNG or WebP picture we can read.")).toBeVisible();
  // Pointing the picture choice at someone else's upload.
  await page.goto("/settings");
  await page.locator('input[name="avatarImage"]').first().evaluate((el, v) => { (el as HTMLInputElement).value = v; (el as HTMLInputElement).checked = true; }, theirs);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Choose one of the portraits shown.")).toBeVisible();
  expect((db.prepare("SELECT avatar_image FROM users WHERE email = ?").get(email) as { avatar_image: string }).avatar_image).toBe("");

  // An admin can put an uploaded picture back to initials; the file goes.
  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto(`/admin/users?q=${encodeURIComponent(ownerEmail)}`);
  admin.once("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "Reset Otto Owner's picture" }).click();
  await expect(admin.getByText("Picture reset to initials.")).toBeVisible();
  expect((db.prepare("SELECT avatar_image FROM users WHERE email = ?").get(ownerEmail) as { avatar_image: string }).avatar_image).toBe("");
  expect((await admin.request.get(theirs)).status()).toBe(404);
  db.close();
});
