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
  expect((await request.get(`/api/calendar/${secret}.ics`)).status()).toBe(404); // the old form, without the account
});
