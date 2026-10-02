import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
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
const FAKES = "http://localhost:4000"; // deploy/rehearsal: stand-ins for Resend, Brevo and S3
const fakes = (path: string, body: unknown) => fetch(`${FAKES}${path}`, { method: "POST", body: JSON.stringify(body) });
let password = "";
let key = "";
let picture = ""; // an uploaded portrait's /uploads/… path, checked after the recovery

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("HTTPS only: http redirects, HSTS and the script policy are on, developer pages don't exist", async ({ request }) => {
  // The image carries no npm (web/Dockerfile): the server's commands are node scripts/….
  expect(compose("exec", "-T", "app", "sh", "-c", "command -v npm npx corepack || echo none").trim()).toBe("none");
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
  const out = compose("exec", "-T", "app", "node", "scripts/admin.mjs", "create", ADMIN, "Rehearsal Owner");
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
  const ids: Record<string, string> = { "Test-only switches": "test-switches", "Demo data": "seed", "Site address": "base-url", "HTTPS only": "https", "Scheduled job": "cron", "Email provider": "email", "Backup email provider": "email-backup", "Backups": "backup", "Off-site copy of backups": "offsite", "Off-site storage used": "offsite-space" };
  const level = (title: string) => page.locator(`[data-check="${ids[title]}"]`).getAttribute("data-level");
  expect(await level("Test-only switches")).toBe("ok");
  expect(await level("Demo data")).toBe("ok");
  expect(await level("Site address")).toBe("ok");
  expect(await level("HTTPS only")).toBe("ok");
  expect(await level("Scheduled job")).toBe("ok");
  expect(await level("Email provider")).toBe("warn"); // set up, but pointed at the rehearsal's stand-in
  expect(await level("Backup email provider")).toBe("ok"); // Resend, then Brevo
  expect(await level("Backups")).toBe("danger"); // none yet
  expect(await level("Off-site copy of backups")).toBe("warn"); // set up, nothing sent yet

  // An uploaded picture, so the recovery below has one to bring back.
  await page.goto("/settings");
  const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#8e2b1c" } }).png().toBuffer();
  await page.getByLabel("Or upload your own picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("About you").fill("I run the Quest Board server and play on weekends."); // the CLI account has none yet
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  // Shown through the image optimizer (/_next/image?url=%2Fuploads%2F…): take the file's own path.
  const src = decodeURIComponent((await page.locator('img[src*="uploads"]').first().getAttribute("src")) ?? "");
  picture = /\/uploads\/[0-9a-f]{32}\.webp/.exec(src)?.[0] ?? src;
  expect(picture).toMatch(/^\/uploads\/[0-9a-f]{32}\.webp$/);

  await page.goto("/admin/setup");
  // Older copies already in the bucket: past 60 days they go, but the newest 3 always stay.
  for (const [stamp, daysAgo] of [["20000103-200000", 20], ["20000102-200000", 90], ["20000101-200000", 100]] as const)
    await fakes("/seed-object", { key: `rehearsal-bucket/questboard/db/questboard-${stamp}.db.gz`, daysAgo });
  // A real backup and its off-site copy (what the scheduler does every night), then both turn OK.
  compose("exec", "-T", "scheduler", "node", "scripts/db-backup.mjs", "backup");
  compose("exec", "-T", "scheduler", "node", "scripts/offsite.mjs");
  await page.reload();
  expect(await level("Backups")).toBe("ok");
  expect(await level("Off-site copy of backups")).toBe("ok");
  const objects = (await (await fetch(`${FAKES}/objects`)).json()) as { key: string; size: number }[];
  expect(objects.some((o) => /^rehearsal-bucket\/questboard\/db\/questboard-.+\.db\.gz$/.test(o.key) && o.size > 1000), JSON.stringify(objects)).toBe(true); // signature checked by the stand-in
  const keys = objects.map((o) => o.key.replace("rehearsal-bucket/questboard/db/", ""));
  expect(keys).toContain("questboard-20000103-200000.db.gz"); // 20 days: kept
  expect(keys).toContain("questboard-20000102-200000.db.gz"); // 90 days, but one of the newest 3
  expect(keys).not.toContain("questboard-20000101-200000.db.gz"); // 100 days: deleted (signed DELETE)
  expect(await level("Off-site storage used")).toBe("ok");
});

test("recovery after losing the server's data: fetch the off-site copy and restore it (deploy/README.md)", async ({ request }) => {
  compose("stop", "app", "scheduler");
  // The disaster: the database, the local backups and the pictures are gone.
  compose("run", "--rm", "--no-deps", "app", "sh", "-c", "rm -rf /data/questboard.db /data/questboard.db-wal /data/questboard.db-shm /data/backups /data/uploads");
  // The README's recovery steps, word for word.
  const fetched = compose("run", "--rm", "--no-deps", "app", "node", "scripts/offsite.mjs", "fetch");
  const file = /restore (\S+\.db) --yes/.exec(fetched)?.[1];
  expect(file, fetched).toMatch(/^\/data\/backups\/questboard-.+\.db$/);
  compose("run", "--rm", "--no-deps", "app", "node", "scripts/db-backup.mjs", "restore", file!, "--yes");
  compose("start", "app", "scheduler");
  await expect.poll(async () => (await request.get("/api/health").catch(() => null))?.status(), { timeout: 120_000, intervals: [3_000] }).toBe(200);
  expect((await request.get(picture)).status(), picture).toBe(200); // the picture came back from the bucket
});

test("sign-up works end to end over HTTPS: the emailed link uses the real address and signs you in", async ({ page }) => {
  // Resend at its daily limit: Brevo takes over.
  await fakes("/control", { resendStatus: 429 });
  const email = `player-${Date.now()}@rehearsal.test`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Rehearsal Player");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-good-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/signup/check-email");
  let mail: { to: string[]; subject: string; text: string; html: string; provider: string } | undefined;
  await expect.poll(async () => {
    const all = (await (await fetch(`${FAKES}/emails`)).json()) as { to: string[]; subject: string; text: string; html: string; provider: string }[];
    mail = all.find((m) => m.to.includes(email));
    return !!mail;
  }, { timeout: 30_000 }).toBe(true);
  const links = mail!.text.match(/https?:\/\/\S+/g) ?? [];
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) expect(link).toMatch(/^https:\/\/localhost:8443\//); // QUESTBOARD_BASE_URL, never the internal address
  expect(mail!.html).toContain("<html"); // the HTML version goes out too
  expect(mail!.provider).toBe("brevo");
  await fakes("/control", { resendStatus: 0 });
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

test("memory: after all of the above, the app and the scheduler use well under their caps (small servers)", async () => {
  const MiB = (s: string) => {
    const m = /([\d.]+)\s*([KMG]i?B)/.exec(s);
    return m ? Number(m[1]) * ({ KiB: 1 / 1024, KB: 1 / 1024, MiB: 1, MB: 1, GiB: 1024, GB: 1024 } as Record<string, number>)[m[2]] : NaN;
  };
  const usage: Record<string, { used: number; cap: number }> = {};
  for (const service of ["app", "scheduler"]) {
    const id = compose("ps", "-q", service).trim();
    const mem = execFileSync("docker", ["stats", "--no-stream", "--format", "{{.MemUsage}}", id], { encoding: "utf8" }).trim(); // "143.2MiB / 768MiB"
    const [used, cap] = mem.split("/");
    usage[service] = { used: MiB(used), cap: MiB(cap) };
    expect(execFileSync("docker", ["inspect", "-f", "{{.State.OOMKilled}}", id], { encoding: "utf8" }).trim(), service).toBe("false");
  }
  console.log("[rehearsal] memory (MiB):", JSON.stringify(usage));
  expect(usage.app.cap).toBe(768); // deploy/docker-compose.yml mem_limit
  expect(usage.scheduler.cap).toBe(384);
  expect(usage.app.used).toBeLessThan(768 / 2);
  expect(usage.scheduler.used).toBeLessThan(384 / 2);
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

test("when the app is down, the scheduler emails the admins — and again when it is back", async ({ request }) => {
  test.setTimeout(420_000);
  const mails = async () => (await (await fetch(`${FAKES}/emails`)).json()) as { to: string[]; subject: string; text: string }[];
  const before = (await mails()).length;
  compose("stop", "app");
  await expect.poll(async () => (await mails()).slice(before).find((m) => m.subject === "Quest Board is down")?.to, { timeout: 240_000, intervals: [10_000] }).toEqual([ADMIN]);
  const down = (await mails()).slice(before).find((m) => m.subject === "Quest Board is down")!;
  expect(down.text).toContain("docker compose logs --tail 100 app");
  compose("start", "app");
  await expect.poll(async () => (await request.get("/api/health").catch(() => null))?.status(), { timeout: 120_000, intervals: [3_000] }).toBe(200);
  await expect.poll(async () => (await mails()).slice(before).some((m) => m.subject === "Quest Board is back up"), { timeout: 180_000, intervals: [10_000] }).toBe(true);
});

test("update.sh: a healthy version stays; a broken one is rolled back by itself, with the database as it was", async ({ request }) => {
  test.setTimeout(420_000);
  const update = (env: Record<string, string>) => spawnSync("sh", ["update.sh"], {
    cwd: DEPLOY, encoding: "utf8",
    env: { ...ENV, QUESTBOARD_COMPOSE: "docker compose -p qb-rehearsal -f docker-compose.yml -f rehearsal/docker-compose.rehearsal.yml", QUESTBOARD_UPDATE_SKIP_FETCH: "1", MSYS_NO_PATHCONV: "1", ...env }, // (Git Bash on Windows: keep /data/… as is)
  });
  const appState = (key: string) => compose("exec", "-T", "app", "node", "-e",
    `const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("/data/questboard.db",{readOnly:true});console.log(JSON.stringify(d.prepare("SELECT value FROM app_state WHERE key = ?").get(${JSON.stringify(key)}) ?? null))`).trim();

  // The same version again: it is healthy, so it stays.
  const same = update({});
  expect(same.status, same.stdout + same.stderr).toBe(0);
  expect(same.stdout).toContain("Updated.");

  // A "new version" that copies the database the way an upgrade does (lib/db.ts), changes it, then crashes.
  const broken = `const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("/data/questboard.db");
if(!d.prepare("SELECT 1 FROM app_state WHERE key='broken_upgrade'").get()){
const s=new Date().toISOString().replace(/[-:]/g,"").replace("T","-").slice(0,15);
d.exec("VACUUM INTO '/data/backups/questboard-before-v99-from-v98-"+s+".db'");
d.prepare("INSERT INTO app_state (key, value) VALUES ('broken_upgrade','yes')").run();}
process.exit(1);`.replace(/\n/g, "");
  // Something people did before the update, which must survive the rollback.
  compose("exec", "-T", "app", "node", "-e", `const {DatabaseSync}=require("node:sqlite");new DatabaseSync("/data/questboard.db").prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES ('before_update', 'kept')").run()`);
  execFileSync("docker", ["build", "-q", "-t", "qb-rehearsal-broken", "-"], { input: `FROM questboard-app\nCMD ["node", "-e", ${JSON.stringify(broken)}]\n`, encoding: "utf8" });
  const rolledBack = update({ QUESTBOARD_IMAGE: "qb-rehearsal-broken", QUESTBOARD_UPDATE_WAIT: "45" });
  expect(rolledBack.status, rolledBack.stdout + rolledBack.stderr).toBe(1);
  expect(rolledBack.stdout).toContain("Restoring the database as it was before the upgrade");
  expect(rolledBack.stdout).toContain("Rolled back");
  await expect.poll(async () => (await request.get("/api/health").catch(() => null))?.status(), { timeout: 60_000, intervals: [3_000] }).toBe(200);
  expect(appState("broken_upgrade")).toBe("null"); // the broken version's change is gone…
  expect(appState("before_update")).toBe('{"value":"kept"}'); // …and what was there before it is still there
  for (const f of readdirSync(DEPLOY).filter((n) => /^update-failed-.*\.log$/.test(n))) rmSync(resolve(DEPLOY, f)); // its logs were kept
  execFileSync("docker", ["rmi", "-f", "qb-rehearsal-broken"]);
});
