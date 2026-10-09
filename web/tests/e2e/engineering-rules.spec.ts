import { test, expect } from "@playwright/test";
import { e2eDb, login } from "./helpers";

// The engineering rules in CLAUDE.md that show in the running app (round 38): structured data on public
// pages, real visitors' page speed, the security log, and the calendar link tied to its account.

const ldTypes = async (page: import("@playwright/test").Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((t) => {
    const data = JSON.parse(t);
    return (Array.isArray(data) ? data : [data]).map((d: { "@type": string }) => d["@type"]);
  });

test("every public content page carries structured data for search engines", async ({ page }) => {
  const expected: [string, string[]][] = [
    ["/", ["WebSite", "Organization"]],
    ["/games", ["CollectionPage", "BreadcrumbList"]],
    ["/games/mercusuar-di-pulau-kabut", ["Event", "BreadcrumbList"]],
    ["/browse", ["WebPage"]],
    ["/browse/genre/horror", ["CollectionPage", "BreadcrumbList"]],
    ["/how-it-works", ["WebPage"]],
    ["/become-a-gm", ["WebPage"]],
    ["/hire-a-gm", ["FAQPage"]],
  ];
  for (const [path, types] of expected) {
    await page.goto(path);
    const found = await ldTypes(page);
    for (const t of types) expect(found, path).toContain(t);
  }
  const gm = (e2eDb().prepare("SELECT id FROM users WHERE email = 'gm@questboard.test'").get() as { id: number }).id;
  await page.goto(`/gms/${gm}`);
  expect(await ldTypes(page)).toContain("ProfilePage");
});

test("page speed from real visits reaches the admin page; nothing but the route pattern is kept", async ({ page, request }) => {
  const db = e2eDb();
  const before = (db.prepare("SELECT COUNT(*) AS n FROM web_vitals").get() as { n: number }).n;
  await page.goto("/games/mercusuar-di-pulau-kabut?ref=whatsapp");
  await page.getByRole("link", { name: /Quest Board/ }).first().click(); // leaving the page sends LCP/CLS
  await expect.poll(() => (db.prepare("SELECT COUNT(*) AS n FROM web_vitals").get() as { n: number }).n, { timeout: 15_000 }).toBeGreaterThan(before);
  const pages = (db.prepare("SELECT DISTINCT page FROM web_vitals").all() as { page: string }[]).map((r) => r.page);
  expect(pages.every((p) => !p.includes("?") && !p.includes("mercusuar"))).toBe(true);
  expect((await request.post("/api/vitals", { data: "not json" })).status()).toBe(204);
  expect((await request.post("/api/vitals", { data: { path: "/wp-login.php", name: "LCP", value: 1 } })).status()).toBe(204);

  await login(page, "admin@questboard.test");
  await page.goto("/admin/errors");
  await expect(page.getByTestId("admin-vitals")).toContainText("/games/[slug]");
});

test("a failed login lands in the security log, which can't be edited", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("player@questboard.test");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  const db = e2eDb();
  const row = db.prepare("SELECT kind, detail FROM security_events WHERE user_id = (SELECT id FROM users WHERE email = 'player@questboard.test') ORDER BY id DESC").get() as { kind: string; detail: string };
  expect(row).toEqual({ kind: "login_failed", detail: "wrong password" });
  expect(() => db.prepare("UPDATE security_events SET detail = 'x'").run()).toThrow(/append-only/);

  await login(page, "admin@questboard.test");
  await page.goto("/admin/errors");
  await expect(page.getByTestId("admin-security-log")).toContainText("Failed login");
});

test("a calendar link with someone else's account number opens nothing", async ({ request }) => {
  const db = e2eDb();
  const uid = (email: string) => (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  const [andi, citra] = [uid("player@questboard.test"), uid("citra@questboard.test")];
  const secret = `rules38${Date.now()}abcdefghijklmnop`;
  db.prepare("UPDATE users SET calendar_token = ? WHERE id = ?").run(secret, andi);
  expect((await request.get(`/api/calendar/${andi}.${secret}.ics`)).status()).toBe(200);
  expect((await request.get(`/api/calendar/${citra}.${secret}.ics`)).status()).toBe(404);
  expect(await (await request.get(`/api/calendar/${secret}.ics`)).text()).not.toContain("BEGIN:VEVENT\r\nUID:session"); // the old form: the "link changed" event only
});

test("five wrong passwords: one log row with a count, and one warning email to the owner (round 39)", async ({ page }) => {
  const db = e2eDb();
  const email = "citra@questboard.test";
  const uid = (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
  const before = (db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE to_address = ? AND subject LIKE '%trying to log in%'").get(email) as { n: number }).n;
  for (let i = 0; i < 6; i++) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(`wrong-${i}`);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  const hour = new Date().toISOString().slice(0, 13);
  expect((db.prepare("SELECT n FROM security_counters WHERE kind = 'login_failed' AND user_id = ? AND hour = ?").get(uid, hour) as { n: number }).n).toBeGreaterThanOrEqual(6);
  expect((db.prepare("SELECT COUNT(*) AS n FROM security_events WHERE kind = 'login_failed' AND user_id = ? AND created_at >= ?").get(uid, hour) as { n: number }).n).toBe(1);
  const after = (db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE to_address = ? AND subject LIKE '%trying to log in%'").get(email) as { n: number }).n;
  expect(after).toBe(before + 1); // the 6th attempt doesn't send a second one

  await login(page, "admin@questboard.test");
  await page.goto("/admin/users?q=citra");
  await page.getByRole("link", { name: "Security log" }).first().click();
  await expect(page.getByRole("heading", { name: /Security log: Citra/ })).toBeVisible();
  await expect(page.getByTestId("admin-security-log")).toContainText(/times this hour/);
});

test("a session older than 90 days ends, and the login page says why (round 39)", async ({ page, context }) => {
  await login(page, "player@questboard.test");
  const db = e2eDb();
  const cookie = (await context.cookies()).find((c) => c.name === "qb_session");
  expect(cookie).toBeTruthy();
  const { createHash } = await import("node:crypto");
  const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
  db.prepare("UPDATE auth_sessions SET created_at = ? WHERE token_hash = ?").run(old, createHash("sha256").update(cookie!.value).digest("hex"));
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?.*ended=max/);
  await expect(page.getByTestId("ended-max-age")).toContainText("90 days");
});
