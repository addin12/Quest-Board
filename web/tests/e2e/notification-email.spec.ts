import { test, expect } from "@playwright/test";
import { login, newPage, signup, unique, e2eDb } from "./helpers";

const AUTH = { Authorization: "Bearer e2e-cron-secret" };
type Mail = { to_address: string; subject: string; body_text: string };

test("important notifications are emailed (queued with the change), respecting the opt-out", async ({ page, browser, request }) => {
  test.setTimeout(90_000);
  const db = e2eDb();
  const game = db.prepare("SELECT id, title FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number; title: string };
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + 45 * 86_400_000).toISOString()).lastInsertRowid);
  const lastId = () => (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  const gmMails = (mark: number) => db.prepare("SELECT to_address, subject, body_text FROM email_outbox WHERE id > ? AND to_address = 'gm@questboard.test'").all(mark) as Mail[];
  try {
    // A new player books: the GM gets an email about it.
    let mark = lastId();
    const name = `Mailtest Player ${Date.now() % 100000}`;
    await signup(page, name, unique("mailtest"));
    await page.goto(`/book/${sid}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Reserve/ }).click();
    await page.waitForURL(/dashboard\?booked=/);
    expect((await (await request.post("/api/cron/reminders", { headers: AUTH })).json()).ok).toBe(true);
    await expect.poll(() => gmMails(mark).filter((m) => m.subject.includes(name)).length).toBe(1);
    const mail = gmMails(mark).find((m) => m.subject.includes(name))!;
    expect(mail.subject).toBe(`${name} reserved a seat at ${game.title}`);
    expect(mail.body_text).toMatch(/http:\/\/localhost:\d+\/gm\n/);
    expect(mail.body_text).toContain("turn these emails off in Settings");

    // The GM turns them off: the next booking is in the bell but not emailed.
    const gm = await newPage(browser);
    await login(gm, "gm@questboard.test");
    await gm.goto("/settings");
    await gm.getByLabel(/Email me about bookings, questions and offers/).uncheck();
    await gm.getByRole("button", { name: "Save profile" }).click();
    await expect(gm.getByText("Profile saved.")).toBeVisible();
    mark = lastId();
    const second = await newPage(browser);
    const name2 = `Quiet Player ${Date.now() % 100000}`;
    await signup(second, name2, unique("quiet"));
    await second.goto(`/book/${sid}`);
    await second.getByRole("checkbox").check();
    await second.getByRole("button", { name: /Reserve/ }).click();
    await second.waitForURL(/dashboard\?booked=/);
    await request.post("/api/cron/reminders", { headers: AUTH });
    expect(gmMails(mark).filter((m) => m.subject.includes(name2))).toHaveLength(0);
    await gm.goto("/notifications");
    await expect(gm.getByText(`${name2} reserved a seat at ${game.title}`)).toBeVisible();
  } finally {
    db.prepare("UPDATE users SET email_notifications = 1 WHERE email = 'gm@questboard.test'").run();
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.close();
  }
});
