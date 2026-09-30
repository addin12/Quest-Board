import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { totpCode, totpStep } from "../../src/lib/totp";

// The production rehearsal (npm run rehearsal): the deployment kit in deploy/ running on this machine —
// app, scheduler and Caddy, on https://localhost:8443 with Caddy's local certificate, a fresh empty
// database and none of the test-only switches. It checks what the normal e2e servers can't (they run
// over http with test shortcuts): HTTPS and its headers, Secure cookies, the scheduler, backups, the
// setup check and a restart. Serial: later steps build on earlier ones.
test.describe.configure({ mode: "serial", timeout: 180_000 });

const DEPLOY = resolve("../deploy"); // Playwright runs from web/
const ENV = { ...process.env, QUESTBOARD_ENV_FILE: "rehearsal/rehearsal.env" };
const compose = (...args: string[]) =>
  execFileSync("docker", ["compose", "-p", "qb-rehearsal", "-f", "docker-compose.yml", "-f", "rehearsal/docker-compose.rehearsal.yml", ...args], { cwd: DEPLOY, env: ENV, encoding: "utf8" });

const ADMIN = "owner@rehearsal.test";
const FAKES = "http://localhost:4000"; // deploy/rehearsal: stand-ins for Resend and S3
let password = "";
let key = "";

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("HTTPS only: http redirects, HSTS and the script policy are on, developer pages don't exist", async ({ request }) => {
  const plain = await request.get("http://localhost:8080/games", { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(plain.status());
  expect(plain.headers()["location"]).toMatch(/^https:\/\/localhost/);
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(h["content-security-policy"]).toMatch(/'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("upgrade-insecure-requests");
  expect(h["x-powered-by"]).toBeUndefined();
  for (const path of ["/dev/outbox", "/dev/emails"]) expect((await request.get(path)).status(), path).toBe(404);
  const health = await (await request.get("/api/health")).json();
  expect(health.ok).toBe(true);
  // An empty launch: no demo games, no demo admin.
  expect((await (await request.get("/api/games")).json()).total).toBe(0);
});

test("the scheduler container runs the job", async ({ request }) => {
  await expect.poll(async () => (await (await request.get("/api/health?full=1")).json()).cron?.ok, { timeout: 150_000, intervals: [5_000] }).toBe(true);
});

test("the first admin: CLI account, Secure cookie, two-step login required, then the setup check", async ({ page, context }) => {
  const out = compose("exec", "-T", "app", "npm", "run", "admin", "--", "create", ADMIN, "Rehearsal Owner");
  password = /\n\s*(\S{12,})\s*$/.exec(out.trim().split("One-time password")[1] ?? "")?.[1] ?? "";
  expect(password, out).not.toBe("");

  await logIn(page);
  await page.waitForURL("**/dashboard");
  const session = (await context.cookies()).find((c) => c.name === "qb_session")!;
  expect(session.secure).toBe(true);
  expect(session.httpOnly).toBe(true);

  // The console needs two-step login first.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/settings\?twoStep=required/);
  await page.getByRole("button", { name: "Set up two-step login" }).click();
  key = (await page.getByTestId("totp-key").innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(totpCode(key, totpStep(Date.now()) - 1));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText(/Two-step login is on \(since/)).toBeVisible();

  await page.goto("/admin/setup");
  const ids: Record<string, string> = { "Test-only switches": "test-switches", "Demo data": "seed", "Site address": "base-url", "HTTPS only": "https", "Scheduled job": "cron", "Email provider": "email", "Backups": "backup", "Off-site copy of backups": "offsite" };
  const level = (title: string) => page.locator(`[data-check="${ids[title]}"]`).getAttribute("data-level");
  expect(await level("Test-only switches")).toBe("ok");
  expect(await level("Demo data")).toBe("ok");
  expect(await level("Site address")).toBe("ok");
  expect(await level("HTTPS only")).toBe("ok");
  expect(await level("Scheduled job")).toBe("ok");
  expect(await level("Email provider")).toBe("warn"); // set up, but pointed at the rehearsal's stand-in
  expect(await level("Backups")).toBe("danger"); // none yet
  expect(await level("Off-site copy of backups")).toBe("warn"); // set up, nothing sent yet

  // A real backup and its off-site copy (what the scheduler does every night), then both turn OK.
  compose("exec", "-T", "scheduler", "npm", "run", "db:backup");
  compose("exec", "-T", "scheduler", "npm", "run", "db:offsite");
  await page.reload();
  expect(await level("Backups")).toBe("ok");
  expect(await level("Off-site copy of backups")).toBe("ok");
  const objects = (await (await fetch(`${FAKES}/objects`)).json()) as { key: string; size: number }[];
  expect(objects.some((o) => /^rehearsal-bucket\/questboard\/db\/questboard-.+\.db\.gz$/.test(o.key) && o.size > 1000), JSON.stringify(objects)).toBe(true); // signature checked by the stand-in
});

test("sign-up works end to end over HTTPS: the emailed link uses the real address and signs you in", async ({ page }) => {
  const email = `player-${Date.now()}@rehearsal.test`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Rehearsal Player");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-good-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/signup/check-email");
  let mail: { to: string[]; subject: string; text: string; html: string } | undefined;
  await expect.poll(async () => {
    const all = (await (await fetch(`${FAKES}/emails`)).json()) as { to: string[]; subject: string; text: string; html: string }[];
    mail = all.find((m) => m.to.includes(email));
    return !!mail;
  }, { timeout: 30_000 }).toBe(true);
  const links = mail!.text.match(/https?:\/\/\S+/g) ?? [];
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) expect(link).toMatch(/^https:\/\/localhost:8443\//); // QUESTBOARD_BASE_URL, never the internal address
  expect(mail!.html).toContain("<html"); // the HTML version goes out too
  const confirm = links.find((l) => l.includes("/verify-email?token="))!;
  await page.goto(confirm);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Your email is confirmed — welcome to Quest Board!")).toBeVisible();
});

test("no page trips the script policy over HTTPS", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { cspViolations: string[] };
    w.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => w.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  for (const path of ["/", "/games", "/board", "/hire-a-gm", "/login", "/signup", "/privacy"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations), path).toEqual([]);
  }
});

test("everything survives a restart of the app", async ({ page, request }) => {
  compose("restart", "app");
  await expect.poll(async () => (await request.get("/api/health").catch(() => null))?.status(), { timeout: 120_000, intervals: [3_000] }).toBe(200);
  await logIn(page); // the account is still there, and still needs its code
  await page.waitForURL("**/login/code");
  await page.getByLabel("6-digit code").fill(totpCode(key, totpStep(Date.now()) + 1));
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/admin/setup");
  expect(await page.locator('[data-check="backup"]').getAttribute("data-level")).toBe("ok"); // the backup is on the volume
});
