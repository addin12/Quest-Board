import { test, expect, type Page } from "@playwright/test";
import { e2eDb, login, newPage, signup } from "./helpers";

// Iteration 3: email verification, password reset, data export, account deletion, legal pages.
// Emails land in the dev outbox (QUESTBOARD_DEV_OUTBOX=true in playwright.config.ts).

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

test("new accounts confirm their email from the emailed link; until then they can't post GM requests", async ({ page }) => {
  const email = unique("verify");
  await signup(page, "Vera Verify", email, false, { confirm: false }); // logged in with the password, not yet confirmed
  await expect(page.getByText(/Please verify .* — we sent you a link/)).toBeVisible();

  // Gated: posting a GM request needs a confirmed email.
  await page.goto("/hire-a-gm/request");
  await expect(page.getByText("Verify your email first — we sent you a link when you signed up.")).toBeVisible();

  // Just opening the link doesn't use it up (mail scanners open links); the button does.
  const link = await linkFromOutbox(page, email, "/verify-email");
  await page.goto(link);
  await page.goto(link);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Your email is confirmed — welcome to Quest Board!")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText(/Please verify/)).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByLabel("Email status")).toContainText("verified");

  // Used up: signed in (already confirmed) it says done; signed out it says so and offers to log in.
  await page.goto(link);
  await expect(page.getByText("Thanks — your email is verified.")).toBeVisible();
  const anon = await page.context().browser()!.newPage();
  await anon.goto(link);
  await expect(anon.getByText("This link is invalid, expired or already used.", { exact: false })).toBeVisible();
  await expect(anon.getByRole("button", { name: "Confirm my email" })).toHaveCount(0);
  await anon.close();
});

test("sign-up never reveals a registered email: same page, the owner gets a note, nobody is signed in", async ({ page, browser }) => {
  const email = unique("taken");
  await signup(page, "Tara Taken", email); // a real, confirmed account
  const db = e2eDb();
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  try {
    const impostor = await (await browser.newContext()).newPage();
    await impostor.goto("/signup");
    await impostor.getByLabel("Display name").fill("Impostor");
    await impostor.getByLabel("Email").fill(email);
    await impostor.getByLabel("Password").fill("another-password-1");
    await impostor.getByRole("button", { name: "Create account" }).click();
    await impostor.waitForURL("**/signup/check-email");
    await expect(impostor.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    await impostor.goto("/dashboard");
    await expect(impostor).toHaveURL(/\/login/); // not signed in as anyone

    // The owner hears about it — with no link that signs anyone in — and nothing else changed.
    const mails = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = ?").all(mark, email) as { subject: string; body_text: string }[];
    expect(mails.map((m) => m.subject)).toEqual(["Someone tried to sign up with your email"]);
    expect(mails[0].body_text).not.toContain("token=");
    expect(mails[0].body_text).toContain("/forgot-password");
    const u = db.prepare("SELECT name FROM users WHERE email = ?").get(email) as { name: string };
    expect(u.name).toBe("Tara Taken");
    await impostor.goto("/login");
    await impostor.getByLabel("Email").fill(email);
    await impostor.getByLabel("Password", { exact: true }).fill("another-password-1");
    await impostor.getByRole("button", { name: "Log in" }).click();
    await expect(impostor.getByText("Incorrect email or password.")).toBeVisible();
  } finally {
    db.close();
  }
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
  await other.getByLabel("Password", { exact: true }).fill("tavern-demo-42");
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
    await page.getByRole("heading", { level: 1 }).waitFor(); // the page is there before counting (count() doesn't wait)
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

  await del.getByLabel("Confirm with your password").fill("tavern-demo-42");
  await del.getByLabel("I understand my account will be permanently deleted.").check();
  await del.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("**/?deleted=1");
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();

  // Can't log back in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("tavern-demo-42");
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
  await del.getByLabel("Confirm with your password").fill("tavern-demo-42");
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

test("Settings lists where you're logged in; a new device is emailed, a known one isn't; one device can be logged out", async ({ page, browser }) => {
  const email = unique("devices");
  await signup(page, "Device Owner", email); // the first device: no "new device" email
  const db = e2eDb();
  const newDeviceMails = () => (db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE to_address = ? AND subject = 'New login to your Quest Board account'").get(email) as { n: number }).n;
  expect(newDeviceMails()).toBe(0);

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, email);
  await expect.poll(newDeviceMails).toBe(1);
  const mail = db.prepare("SELECT body_text FROM email_outbox WHERE to_address = ? AND subject = 'New login to your Quest Board account'").get(email) as { body_text: string };
  expect(mail.body_text).toMatch(/(Chrome|Edge) · (Windows|Linux|macOS)/);
  expect(mail.body_text).toContain("/forgot-password");
  // Logging in again on that browser (it keeps its device cookie) isn't news.
  await other.getByRole("button", { name: /Account menu/ }).click(); // logging out is in the account menu
  await other.getByRole("button", { name: "Log out", exact: true }).click();
  await other.waitForURL((u) => u.pathname === "/");
  await login(other, email);
  expect(newDeviceMails()).toBe(1);

  await page.goto("/settings");
  const rows = page.getByTestId("login-row");
  await expect(rows).toHaveCount(2); // this one, and the other browser's latest session
  await expect(rows.first().getByText("This device")).toBeVisible();
  await expect(rows.nth(1).getByText(/Logged in .+ · last active/)).toBeVisible();
  await rows.nth(1).getByRole("button", { name: /^Log out / }).click();
  await expect(page.getByText("That device was logged out.")).toBeVisible();
  await expect(rows).toHaveCount(1);
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login\?next=/);
  db.close();
});

test("after a Privacy Policy update, signed-in people see what changed once; new sign-ups don't", async ({ page }) => {
  const email = unique("policy");
  await signup(page, "Policy Reader", email);
  const banner = page.getByRole("complementary", { name: "Privacy Policy update" });
  await expect(banner).toHaveCount(0); // they just agreed to this version
  // As if they had signed up under the previous version.
  const db = e2eDb();
  db.prepare("UPDATE users SET legal_seen_version = '2026-09-25-draft' WHERE email = ?").run(email);
  await page.goto("/games");
  await expect(banner.getByText(/We've updated our Privacy Policy: it now covers two-step login/)).toBeVisible();
  await expect(banner.getByRole("link", { name: "Read the policy" })).toHaveAttribute("href", "/privacy");
  await banner.getByRole("button", { name: "Got it" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(banner).toHaveCount(0);
  expect((db.prepare("SELECT legal_seen_version FROM users WHERE email = ?").get(email) as { legal_seen_version: string }).legal_seen_version).not.toBe("2026-09-25-draft");
  db.close();
});

test("sessions slide: using the site renews the sign-in, in the database and the cookie", async ({ page, context }) => {
  const email = unique("slide");
  await signup(page, "Steady Visitor", email);
  const db = e2eDb();
  // As if they logged in 29 days ago and were last active 20 minutes ago.
  const soon = new Date(Date.now() + 86_400_000).toISOString();
  db.prepare("UPDATE auth_sessions SET expires_at = ?, last_seen_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(soon, new Date(Date.now() - 20 * 60_000).toISOString(), email);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  const row = db.prepare("SELECT expires_at FROM auth_sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)").get(email) as { expires_at: string };
  expect(Date.parse(row.expires_at) - Date.now()).toBeGreaterThan(29 * 86_400_000);
  const cookie = (await context.cookies()).find((c) => c.name === "qb_session")!;
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);
  expect(cookie.httpOnly).toBe(true);
  db.close();
});

test("the time zone for emails comes from the browser at sign-up and can be changed in Settings", async ({ browser }) => {
  const page = await (await browser.newContext({ timezoneId: "Asia/Makassar" })).newPage();
  const email = unique("wita");
  await signup(page, "Putu Makassar", email);
  const db = e2eDb();
  const tzOf = () => (db.prepare("SELECT time_zone FROM users WHERE email = ?").get(email) as { time_zone: string }).time_zone;
  expect(tzOf()).toBe("Asia/Makassar");
  await page.goto("/settings");
  // Times on the page are in that zone too, not always WIB ("Where you're logged in").
  await expect(page.getByText(/Logged in .+ WITA · last active .+ WITA/)).toBeVisible();
  const select = page.getByLabel("Time zone for emails and reminders");
  await expect(select).toHaveValue("Asia/Makassar");
  await expect(select.locator("option:checked")).toHaveText(/^WITA — Central Indonesia/);
  await select.selectOption("Asia/Jayapura");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(tzOf()).toBe("Asia/Jayapura");
  db.close();
});

test("one-click unsubscribe links turn off exactly that kind of email; a wrong token does nothing", async ({ page, request }) => {
  const { createHmac } = await import("node:crypto");
  const email = unique("unsub");
  await signup(page, "Unsub Reader", email);
  await page.goto("/settings"); // any page load creates the signing key if needed
  const db = e2eDb();
  const id = (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  // The key is created on first use (e.g. the first notification email); make sure it exists.
  db.prepare("INSERT OR IGNORE INTO app_state (key, value) VALUES ('unsubscribe_key', 'e2e-unsubscribe-key')").run();
  const key = (db.prepare("SELECT value FROM app_state WHERE key = 'unsubscribe_key'").get() as { value: string }).value;
  const token = (kind: string) => createHmac("sha256", key).update(`${id}:${kind}`).digest("base64url").slice(0, 32);
  const prefs = () => db.prepare("SELECT email_notifications AS n, email_reminders AS r FROM users WHERE id = ?").get(id) as { n: number; r: number };
  expect(prefs()).toEqual({ n: 1, r: 1 });

  expect((await request.post(`/api/unsubscribe?u=${id}&k=notifications&t=wrong-token-wrong-token-wrong-tok`)).status()).toBe(400);
  expect((await request.post(`/api/unsubscribe?u=${id + 1}&k=notifications&t=${token("notifications")}`)).status()).toBe(400); // someone else's
  expect(prefs()).toEqual({ n: 1, r: 1 });

  // A person opening the link sees a page first; the button (or the mail app's one-click POST) turns them off.
  await page.goto(`/api/unsubscribe?u=${id}&k=notifications&t=${token("notifications")}`);
  await expect(page.getByRole("heading", { name: "Stop these emails?" })).toBeVisible();
  expect(prefs()).toEqual({ n: 1, r: 1 });
  await page.getByRole("button", { name: "Turn them off" }).click();
  await expect(page.getByText("You won't get emails about bookings, questions and offers any more.")).toBeVisible();
  expect(prefs()).toEqual({ n: 0, r: 1 });
  const oneClick = await request.post(`/api/unsubscribe?u=${id}&k=reminders&t=${token("reminders")}`, { form: { "List-Unsubscribe": "One-Click" } });
  expect(oneClick.status()).toBe(200);
  expect(prefs()).toEqual({ n: 0, r: 0 });
  db.close();
});

test("the login email can be changed: the new address confirms it, the old one is told; taken addresses and a password reset change nothing", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const db = e2eDb();
  const mailsTo = (to: string) => db.prepare("SELECT subject, body_text FROM email_outbox WHERE to_address = ? ORDER BY id DESC").all(to) as { subject: string; body_text: string }[];
  const oldEmail = unique("move-old");
  const newEmail = unique("move-new");
  await signup(page, "Mira Mover", oldEmail);
  await page.goto("/settings");
  const form = page.locator("#login-email");

  // The password is checked first.
  await form.getByLabel("New email").fill(newEmail);
  await form.getByLabel("Your password").fill("not-my-password");
  await form.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(form.getByText("Your current password is incorrect.")).toBeVisible();

  await form.getByLabel("New email").fill(newEmail);
  await form.getByLabel("Your password").fill("tavern-demo-42");
  await form.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(form.getByText(`Check ${newEmail}: open the link there to finish.`)).toBeVisible();
  expect(mailsTo(oldEmail)[0].subject).toBe("Someone asked to change your Quest Board login email");
  await page.reload();
  await expect(page.locator("#login-email").getByText(`Waiting for you to confirm ${newEmail}`)).toBeVisible();

  // Opened on another device, signed out: it still works (the password was checked when asking).
  const link = /https?:\/\/\S+\/change-email\?token=[\w-]+/.exec(mailsTo(newEmail)[0].body_text)![0];
  const phone = await newPage(browser);
  await phone.goto(new URL(link).pathname + new URL(link).search);
  await expect(phone.getByText(`Make ${newEmail} the email you log in with?`)).toBeVisible();
  await phone.getByRole("button", { name: "Yes, use this email" }).click();
  await phone.waitForURL("**/login");
  expect(mailsTo(oldEmail)[0].subject).toBe("Your Quest Board login email was changed");
  await login(phone, newEmail); // the new address logs in…
  await phone.goto(new URL(link).pathname + new URL(link).search); // …and the link is used up
  await expect(phone.getByText("This link isn't valid, has expired or was already used.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(newEmail, { exact: true }).first()).toBeVisible();

  // Someone else asking for an address that has an account: the same answer, nothing changes, its owner is told.
  const other = await newPage(browser);
  const otherEmail = unique("move-other");
  await signup(other, "Otto Other", otherEmail);
  await other.goto("/settings");
  const otherForm = other.locator("#login-email");
  await otherForm.getByLabel("New email").fill(newEmail);
  await otherForm.getByLabel("Your password").fill("tavern-demo-42");
  await otherForm.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(otherForm.getByText(`Check ${newEmail}: open the link there to finish.`)).toBeVisible();
  expect(mailsTo(newEmail)[0].subject).toBe("Someone tried to use your email on Quest Board");
  expect((db.prepare("SELECT email FROM users WHERE email = ?").get(otherEmail) as { email: string }).email).toBe(otherEmail);

  // A pending change is dropped by a password reset (maybe someone else asked for it).
  const third = unique("move-third");
  await otherForm.getByLabel("New email").fill(third);
  await otherForm.getByLabel("Your password").fill("tavern-demo-42");
  await otherForm.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(otherForm.getByText(`Check ${third}`)).toBeVisible();
  const thirdLink = /https?:\/\/\S+\/change-email\?token=[\w-]+/.exec(mailsTo(third)[0].body_text)![0];
  const anon = await newPage(browser);
  await anon.goto("/forgot-password");
  await anon.getByLabel("Email").fill(otherEmail);
  await anon.getByRole("button", { name: "Send reset link" }).click();
  await anon.goto(await linkFromOutbox(anon, otherEmail, "/reset-password"));
  await anon.getByLabel("New password").fill("brandnew-pass-9");
  await anon.getByRole("button", { name: "Save new password" }).click();
  await anon.waitForURL("**/dashboard?reset=1");
  await anon.goto(new URL(thirdLink).pathname + new URL(thirdLink).search);
  await expect(anon.getByText("This link isn't valid, has expired or was already used.")).toBeVisible();
  db.close();
});

test("a bounce or spam report from the email provider stops optional emails; Settings says so and can start them again", async ({ page, request }) => {
  const { createHmac } = await import("node:crypto");
  const email = unique("bounce");
  await signup(page, "Bram Bounce", email);
  const resend = (body: string, secret = "e2e webhook key") => {
    const id = `msg_${Date.now()}`, ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(secret)).update(`${id}.${ts}.${body}`).digest("base64");
    return request.post("/api/email-events/resend", { data: body, headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
  };
  const bounced = JSON.stringify({ type: "email.bounced", data: { to: [email], bounce: { type: "Permanent", message: "550 no such user" } } });
  expect((await resend(bounced, "someone else's key")).status()).toBe(401); // forged
  const ok = await resend(bounced);
  expect(ok.status()).toBe(200);
  expect((await ok.json()).recorded).toBe(1);

  await page.goto("/settings");
  const banner = page.getByTestId("emails-stopped");
  await expect(banner.getByText(`Emails to ${email} bounced`)).toBeVisible();
  await banner.getByRole("button", { name: "Start sending again" }).click();
  await expect(page.getByText("Notification emails and reminders are on again.")).toBeVisible();
  await expect(page.getByTestId("emails-stopped")).toHaveCount(0);

  // Brevo: a token in the URL instead of a signature.
  const spam = { event: "spam", email };
  expect((await request.post("/api/email-events/brevo?token=wrong", { data: spam })).status()).toBe(401);
  expect((await request.post("/api/email-events/brevo?token=e2e-brevo-token", { data: spam })).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("emails-stopped").getByText(/was marked as spam/)).toBeVisible();
});

test("sign-up and password changes refuse passwords that are too easy to guess", async ({ page }) => {
  const email = unique("weakpw");
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Wira Weak");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("That password is too easy to guess")).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);

  await signup(page, "Wira Weak", email); // a good one works
  await page.goto("/settings");
  await page.getByLabel("Current password").fill("tavern-demo-42");
  await page.getByLabel("New password").fill("WiraWeak2024");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("That password is too easy to guess")).toBeVisible(); // made from their own name
});
