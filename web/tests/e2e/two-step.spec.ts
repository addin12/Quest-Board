import { test, expect, type Browser, type Page } from "@playwright/test";
import { createGmWithGame, e2eDb, login } from "./helpers";
import { totpCode, totpStep } from "../../src/lib/totp";

// Two-step login for admins: set up in Settings, a code after the password, each code once,
// five wrong codes end the login step, turning it off takes a code. Uses its own admin.

const EMAIL = "two-step-admin@questboard.test";
const code = (key: string, offset = 0) => totpCode(key, totpStep(Date.now()) + offset);

async function passwordStep(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("tavern-demo-42");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/login/code");
  return page;
}

test("GMs are offered two-step login too; players aren't", async ({ browser }) => {
  const gm = await (await browser.newContext()).newPage();
  await login(gm, "gm@questboard.test");
  await gm.goto("/settings");
  await expect(gm.getByRole("button", { name: "Set up two-step login" })).toBeVisible();
  await expect(gm.getByText(/Needed for verified GMs/)).toBeVisible(); // the demo GM is verified
  const player = await (await browser.newContext()).newPage();
  await login(player, "player@questboard.test");
  await player.goto("/settings");
  await expect(player.getByRole("heading", { name: "Two-step login" })).toHaveCount(0);
});

test("verified GMs need two-step login to change their profile or payment details", async ({ page }) => {
  const email = `verified-gm-${Date.now()}@questboard.test`;
  await createGmWithGame(page, "Vera Verified", email, `Vera's Table ${Date.now() % 100000}`);
  const db = e2eDb();
  db.prepare("UPDATE gm_profiles SET verified = 1 WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(email);
  await page.goto("/gm");
  await expect(page.getByText(/You're a verified GM, so players trust your payment details/)).toBeVisible();
  // The profile form waits until two-step login is on (no filling it in only to be refused)…
  await page.goto("/become-a-gm");
  await expect(page.getByTestId("two-step-first")).toBeVisible();
  await expect(page.getByLabel(/How players pay you/)).toHaveCount(0);
  // (The save action still refuses on its own: err.verifiedGmTwoStep in actions.ts.)

  // Turning it on brings them straight back to the form, and saving works.
  await page.getByTestId("two-step-first").getByRole("link", { name: "Turn on two-step login" }).click();
  await expect(page.getByText(/Needed for verified GMs/)).toBeVisible();
  await page.getByRole("button", { name: "Set up two-step login" }).click();
  const key = (await page.getByTestId("totp-key").innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(code(key, -1));
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.waitForURL("**/become-a-gm");
  await page.getByLabel(/How players pay you/).fill("BRI 111-222 a.n. Vera Verified");
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");
  await expect(page.getByText(/You're a verified GM/)).toHaveCount(0);
  db.close();
});

test("admins can turn on two-step login, then need a code from their app to log in", async ({ browser }) => {
  const db = e2eDb();
  // A fresh admin with the demo password (copied from the seeded admin).
  db.prepare(`INSERT INTO users (email, password_hash, name, role, email_verified_at)
    SELECT ?, password_hash, 'Two Step Admin', 'admin', created_at FROM users WHERE email = 'admin@questboard.test'`).run(EMAIL);
  const mails = (subject: string) => (db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE to_address = ? AND subject = ?").get(EMAIL, subject) as { n: number }).n;

  // No login step without a password first.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/login/code");
  await expect(anon).toHaveURL(/\/login$/);

  // (These e2e servers don't require it for the console — QUESTBOARD_ADMIN_TWO_STEP=optional;
  // empty-launch.spec checks the real rule.)
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("tavern-demo-42");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/settings#two-step");

  // Setup: QR code and key, a wrong code, then the right one.
  await page.getByRole("button", { name: "Set up two-step login" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const key = (await page.getByTestId("totp-key").innerText()).replace(/\s/g, "");
  expect(key).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel("6-digit code").fill(code(key, -1) === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("That code didn't work.")).toBeVisible();
  const setupCode = code(key, -1); // the previous step: later steps are left for the login and turning it off
  await page.getByLabel("6-digit code").fill(setupCode);
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Two-step login is on. Your other devices were logged out.")).toBeVisible();
  await expect(page.getByText(/Two-step login is on \(since/)).toBeVisible();
  expect(mails("Two-step login is on for your Quest Board account")).toBe(1);
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Set it up" })).toHaveCount(0);

  // A password reset proves the inbox, not the phone: it ends at the code step, not signed in.
  const reset = await (await browser.newContext()).newPage();
  await reset.goto("/forgot-password");
  await reset.getByLabel("Email").fill(EMAIL);
  await reset.getByRole("button", { name: "Send reset link" }).click();
  await expect(reset.getByText(/a reset link is on its way/)).toBeVisible();
  const resetMail = db.prepare("SELECT body_text FROM email_outbox WHERE to_address = ? AND body_text LIKE '%/reset-password?token=%' ORDER BY id DESC").get(EMAIL) as { body_text: string };
  const link = /https?:\/\/\S+\/reset-password\?token=[\w-]+/.exec(resetMail.body_text)![0];
  await reset.goto(new URL(link).pathname + new URL(link).search);
  await reset.getByLabel("New password").fill("tavern-demo-42");
  await reset.getByRole("button", { name: "Save new password" }).click();
  await reset.waitForURL("**/login/code");
  await reset.goto("/dashboard");
  await expect(reset).toHaveURL(/\/login\?next=/); // no session

  // Log in again: the password leads to the code step; a used code doesn't work twice.
  const second = await passwordStep(browser);
  await second.getByLabel("6-digit code").fill(setupCode);
  await second.getByRole("button", { name: "Log in" }).click();
  await expect(second.getByText("That code didn't work.")).toBeVisible();
  await second.getByLabel("6-digit code").fill(code(key));
  await second.getByRole("button", { name: "Log in" }).click();
  await second.waitForURL("**/dashboard");

  // Five wrong codes end the login step.
  const third = await passwordStep(browser);
  const attempts = () => (db.prepare("SELECT MAX(attempts) AS n FROM login_challenges l JOIN users u ON u.id = l.user_id WHERE u.email = ?").get(EMAIL) as { n: number | null }).n;
  for (let i = 1; i <= 4; i++) {
    await third.getByLabel("6-digit code").fill("000000");
    await third.getByRole("button", { name: "Log in" }).click();
    await expect.poll(attempts).toBe(i); // the same message stays up, so wait for each answer to count
    // …and for the reply to be handled ("Checking…" back to "Log in"): it resets the form, which would
    // otherwise wipe the next code as it's typed and send an empty one (seen once on CI).
    await expect(third.getByRole("button", { name: "Log in" })).toBeEnabled();
    await expect(third.getByText("That code didn't work.")).toBeVisible();
  }
  await third.getByLabel("6-digit code").fill("000000");
  await third.getByRole("button", { name: "Log in" }).click();
  await expect(third).toHaveURL(/\/login\?step=locked$/);
  await expect(third.getByText("Too many wrong codes. Please log in again.")).toBeVisible();
  await third.goto("/login/code"); // the step is gone
  await expect(third).toHaveURL(/\/login$/);

  // Turning it off takes a current code, and is emailed.
  await second.goto("/settings");
  await second.getByLabel("6-digit code").fill(code(key, 1));
  await second.getByRole("button", { name: "Turn off two-step login" }).click();
  await expect(second.getByText("Two-step login is off.")).toBeVisible();
  await expect(second.getByRole("button", { name: "Set up two-step login" })).toBeVisible();
  expect(mails("Two-step login was turned off")).toBe(1);
  db.close();
});
