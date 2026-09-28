import { test, expect, type Page } from "@playwright/test";

// Iteration 3: email verification, password reset, data export, account deletion, legal pages.
// Emails land in the dev outbox (QUESTBOARD_DEV_OUTBOX=true in playwright.config.ts).

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

async function signup(page: Page, name: string, email: string, gm = false) {
  await page.goto("/signup");
  if (gm) await page.getByText("Run games").click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(gm ? "**/gm" : "**/dashboard");
}

/** The newest link in the outbox sent to `email` whose URL contains `path`. */
async function linkFromOutbox(page: Page, email: string, path: string): Promise<string> {
  await page.goto("/dev/outbox");
  const mail = page.getByTestId("outbox-mail").filter({ has: page.getByTestId("outbox-to").getByText(email, { exact: true }) }).filter({ hasText: path }).first();
  const body = (await mail.getByTestId("outbox-body").textContent()) ?? "";
  const m = new RegExp(`https?://[^\\s]+${path}\\?token=[\\w-]+`).exec(body);
  expect(m, `no ${path} link for ${email}`).not.toBeNull();
  return new URL(m![0]).pathname + new URL(m![0]).search;
}

const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@questboard.test`;

test("new accounts verify their email from the emailed link; unverified accounts can't post GM requests", async ({ page }) => {
  const email = unique("verify");
  await signup(page, "Vera Verify", email);
  await expect(page.getByText(/Please verify .* — we sent you a link/)).toBeVisible();

  // Gated: posting a GM request needs a verified email.
  await page.goto("/hire-a-gm/request");
  await expect(page.getByText("Verify your email first — we sent you a link when you signed up.")).toBeVisible();

  const link = await linkFromOutbox(page, email, "/verify-email");
  await page.goto(link);
  await expect(page.getByText("Thanks — your email is verified.")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText(/Please verify/)).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByLabel("Email status")).toContainText("verified");

  // Links are single-use: reopening it signed out says invalid; signed in (already verified) it still says done.
  await page.goto(link);
  await expect(page.getByText("Thanks — your email is verified.")).toBeVisible();
  const anon = await page.context().browser()!.newPage();
  await anon.goto(link);
  await expect(anon.getByText("This link is invalid or has expired.", { exact: false })).toBeVisible();
  await anon.close();
});

test("forgot password: same answer for any email, a one-time link, and other devices are signed out", async ({ browser }) => {
  const email = unique("reset");
  const a = await (await browser.newContext()).newPage();
  await signup(a, "Rhea Reset", email);
  const other = await (await browser.newContext()).newPage();
  await login(other, email);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/login");
  await anon.getByRole("link", { name: "Forgot password?" }).click();
  await expect(anon.getByRole("heading", { level: 1, name: "Forgot your password?" })).toBeVisible(); // not the login form's Email field
  await anon.getByLabel("Email").fill("nobody-here@questboard.test");
  await anon.getByRole("button", { name: "Send reset link" }).click();
  const sameAnswer = /If that email has an account, a reset link is on its way/;
  await expect(anon.getByText(sameAnswer)).toBeVisible();

  await anon.goto("/forgot-password");
  await anon.getByLabel("Email").fill(email);
  await anon.getByRole("button", { name: "Send reset link" }).click();
  await expect(anon.getByText(sameAnswer)).toBeVisible();

  // No email was queued for the unknown address.
  await anon.goto("/dev/outbox");
  await expect(anon.getByTestId("outbox-to").getByText("nobody-here@questboard.test", { exact: true })).toHaveCount(0);

  const link = await linkFromOutbox(anon, email, "/reset-password");
  await anon.goto(link);
  await anon.getByLabel("New password").fill("short");
  await anon.getByRole("button", { name: "Save new password" }).click();
  await expect(anon.getByText("Password must be at least 8 characters.")).toBeVisible();
  await anon.getByLabel("New password").fill("brandnew-pass-9");
  await anon.getByRole("button", { name: "Save new password" }).click();
  await anon.waitForURL("**/dashboard?reset=1");
  await expect(anon.getByText(/Your password was changed/)).toBeVisible();

  // The old session elsewhere is gone; the old password no longer works; the new one does.
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login/);
  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password", { exact: true }).fill("password123");
  await other.getByRole("button", { name: "Log in" }).click();
  await expect(other.getByText("Incorrect email or password.")).toBeVisible();
  await login(other, email, "brandnew-pass-9");

  // The link can't be reused.
  await anon.goto(link);
  await expect(anon.getByText("This link is invalid, expired or already used.")).toBeVisible();
});

test("signed-in people can download their data; anonymous requests are refused", async ({ page, request }) => {
  expect((await request.get("/api/me/export")).status()).toBe(401);
  await login(page, "player@questboard.test");
  await page.goto("/settings");
  const href = await page.getByRole("link", { name: "Download my data" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const data = await res.json();
  expect(data.account.email).toBe("player@questboard.test");
  expect(Array.isArray(data.bookings) && data.bookings.length).toBeTruthy();
  expect(data.account.password_hash).toBeUndefined();
});

async function bookFirstOpenSeat(page: Page, slugs: string[]): Promise<string> {
  for (const slug of slugs) {
    await page.goto(`/games/${slug}`);
    if (await page.getByRole("link", { name: "Book" }).count()) {
      const title = ((await page.getByRole("heading", { level: 1 }).textContent()) ?? "").trim();
      await page.getByRole("link", { name: "Book" }).first().click();
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Reserve my seat" }).click();
      await page.waitForURL("**/dashboard?booked=*");
      return title;
    }
  }
  throw new Error("no open seat found");
}

test("deleting a player account releases their seats, tells the GM, and blocks login", async ({ browser }) => {
  const email = unique("leaver");
  const page = await (await browser.newContext()).newPage();
  await signup(page, "Lena Leaver", email);
  const title = await bookFirstOpenSeat(page, ["panen-harapan", "mahkota-yang-terbelah", "naga-naga-hutan-bara-petualangan-pemula"]);

  await page.goto("/settings");
  const del = page.getByRole("region", { name: "Delete account" });
  await del.getByLabel("Confirm with your password").fill("wrong-password");
  await del.getByRole("button", { name: "Delete my account" }).click();
  await expect(del.getByText("Your current password is incorrect.")).toBeVisible();
  await expect(del.getByText("Tick the box to confirm.")).toBeVisible();

  await del.getByLabel("Confirm with your password").fill("password123");
  await del.getByLabel("I understand my account will be permanently deleted.").check();
  await del.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("**/?deleted=1");
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();

  // Can't log back in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login/);

  // The GM (Dewi runs all three candidate games) is told, with the scrubbed name.
  const gm = await (await browser.newContext()).newPage();
  await login(gm, "dewi@questboard.test");
  await gm.goto("/notifications");
  await expect(gm.getByText(`Anonymous cancelled their seat at ${title}`).first()).toBeVisible();
});

test("deleting a GM account archives their games and notifies booked players", async ({ browser }) => {
  const gmEmail = unique("gm-leaver");
  const gm = await (await browser.newContext()).newPage();
  await signup(gm, "Gino Gone", gmEmail, true);
  await gm.getByRole("link", { name: /Edit profile & payment details/ }).click();
  await gm.getByLabel("Headline").fill("Short one-shots");
  await gm.getByLabel("About you").fill("GM yang suka one-shot singkat dan cerita misteri di kota.");
  await gm.getByLabel("Location").fill("online");
  await gm.getByLabel(/How players pay you/).fill("BCA 000-111-222");
  await gm.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await gm.waitForURL("**/gm");
  await gm.goto("/gm/games/new");
  await gm.getByLabel("Title").fill("Farewell Mystery");
  await gm.getByLabel("Game system").fill("Call of Cthulhu");
  await gm.getByLabel("One-line summary").fill("A last mystery before the GM hangs up the dice.");
  await gm.getByLabel("Full description").fill("Short investigation one-shot. Characters provided, beginners welcome, three hours.");
  await gm.getByLabel("Platform(s)").fill("Discord");
  await gm.getByLabel("Price per seat, per session").fill("0");
  await gm.getByRole("button", { name: "Create game" }).click();
  await gm.waitForURL(/\/gm\/games\/\d+$/);
  const future = new Date(Date.now() + 5 * 86_400_000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await gm.getByLabel(/Date & time/).fill(local);
  await gm.getByRole("button", { name: "Add session" }).click();
  await expect(gm.getByText("Session added.")).toBeVisible();
  const slug = (await gm.getByRole("link", { name: "View listing" }).first().getAttribute("href"))!.split("/").pop()!;
  await gm.goto(`/games/${slug}`);
  const gmProfileUrl = (await gm.getByRole("link", { name: /Gino Gone/ }).first().getAttribute("href"))!;

  const player = await (await browser.newContext()).newPage();
  await login(player, "fajar@questboard.test");
  await bookFirstOpenSeat(player, [slug]);

  await gm.goto("/settings");
  const del = gm.getByRole("region", { name: "Delete account" });
  await expect(del.getByText(/Your games are archived/)).toBeVisible();
  await del.getByLabel("Confirm with your password").fill("password123");
  await del.getByLabel("I understand my account will be permanently deleted.").check();
  await del.getByRole("button", { name: "Delete my account" }).click();
  await gm.waitForURL("**/?deleted=1");

  expect((await player.goto(`/games/${slug}`))?.status()).toBe(404);
  expect((await player.goto(gmProfileUrl))?.status()).toBe(404);
  await player.goto("/notifications");
  await expect(player.getByText("The GM cancelled a session of Farewell Mystery that you had booked")).toBeVisible();
  await player.goto("/hire-a-gm?q=Gino#directory");
  await expect(player.locator("#directory").getByText("Gino Gone")).toHaveCount(0);
});

test("Terms and Privacy pages exist in both languages and are linked from sign-up and the footer", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Privacy Policy" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText(/UU No\. 27 Tahun 2022/)).toBeVisible();
  await expect(page.getByText(/Draft for launch/)).toBeVisible();
  // Every cookie the app sets is listed.
  for (const cookie of ["qb_session", "qb_lang", "qb_theme", "qb_toast"]) await expect(page.getByText(cookie)).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms of Service" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^4\. Payments and refunds/ })).toBeVisible();
  await page.getByRole("button", { name: "id", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ketentuan Layanan" })).toBeVisible();
});
