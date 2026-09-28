import { expect, test, type Browser, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";

/**
 * The database of the server this test runs against (each seeded project has its own — see
 * playwright.config.ts), opened like the app opens it: waits for the server's writes instead of failing.
 */
export function e2eDb(file = (test.info().project.metadata as { db?: string }).db ?? "data/e2e.db"): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

// Shared journey steps for e2e specs (English UI).

export async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

/**
 * Sign up. By default also confirms the email (the emailed link's "Confirm my email" signs you in).
 * `confirm: false` leaves the address unconfirmed and logs in with the password instead.
 */
export async function signup(page: Page, name: string, email: string, gm = false, opts: { confirm?: boolean } = {}) {
  await page.goto("/signup");
  if (gm) await page.getByText("Run games").click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  if (opts.confirm === false) {
    await page.waitForURL("**/signup/check-email");
    await login(page, email);
    return;
  }
  await confirmSignup(page, email, gm);
}

/** The newest emailed confirmation link for `email` (read from the e2e outbox), as a path. */
export async function confirmLink(email: string): Promise<string> {
  const db = e2eDb();
  try {
    for (let i = 0; i < 50; i++) {
      const row = db.prepare("SELECT body_text FROM email_outbox WHERE to_address = ? AND body_text LIKE '%/verify-email?token=%' ORDER BY id DESC").get(email) as { body_text: string } | undefined;
      const m = row && /https?:\/\/\S+\/verify-email\?token=[\w-]+(?:&next=\S+)?/.exec(row.body_text);
      if (m) return new URL(m[0]).pathname + new URL(m[0]).search;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no confirmation link emailed to ${email}`);
  } finally {
    db.close();
  }
}

/** After "Create account": the check-email page, then the emailed link and "Confirm my email" (which signs in). */
export async function confirmSignup(page: Page, email: string, gm = false) {
  await page.waitForURL("**/signup/check-email");
  await page.goto(await confirmLink(email));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL(gm ? "**/gm" : "**/dashboard");
}

export const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@questboard.test`;

export async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

/** Sign up a GM, fill the GM profile, create a free online game with one session in 5 days. Returns its slug. */
export async function createGmWithGame(page: Page, name: string, email: string, title: string, opts: { seats?: number; price?: string } = {}): Promise<string> {
  await signup(page, name, email, true);
  await page.getByRole("link", { name: /Edit profile & payment details/ }).click();
  await page.getByLabel("Headline").fill("Short one-shots");
  await page.getByLabel("About you").fill("GM yang suka one-shot singkat dan cerita misteri di kota.");
  await page.getByLabel("Location").fill("online");
  await page.getByLabel(/How players pay you/).fill("BCA 000-111-222");
  await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
  await page.waitForURL("**/gm");
  await page.goto("/gm/games/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Game system").fill("Call of Cthulhu");
  await page.getByLabel("One-line summary").fill("A short mystery for a quiet evening.");
  await page.getByLabel("Full description").fill("Short investigation one-shot. Characters provided, beginners welcome, three hours.");
  await page.getByLabel("Platform(s)").fill("Discord");
  await page.getByLabel("Price per seat, per session").fill(opts.price ?? "0");
  if (opts.seats) await page.getByLabel("Seats per session").fill(String(opts.seats));
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/gm\/games\/\d+$/);
  const future = new Date(Date.now() + 5 * 86_400_000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel(/Date & time/).fill(local);
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(page.getByText("Session added.")).toBeVisible();
  return (await page.getByRole("link", { name: "View listing" }).first().getAttribute("href"))!.split("/").pop()!;
}

/** Reserve the first open seat among `slugs`; returns the game title. */
export async function bookFirstOpenSeat(page: Page, slugs: string[]): Promise<string> {
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
