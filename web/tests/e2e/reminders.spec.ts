import { test, expect } from "@playwright/test";
import { login, e2eDb } from "./helpers";

const AUTH = { Authorization: "Bearer e2e-cron-secret" };
type Mail = { to_address: string; subject: string; body_text: string };

test("P2-12 session reminders: in-app + email in the person's language, once each, respecting the opt-out", async ({ page, request }) => {
  const db = e2eDb();
  db.exec("PRAGMA foreign_keys = ON"); // so cleanup removes the test bookings and reminders too
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  const game = db.prepare("SELECT id, title FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number; title: string };
  const addSession = (hoursAhead: number) => {
    const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + hoursAhead * 3_600_000).toISOString()).lastInsertRowid);
    db.prepare("INSERT INTO bookings (session_id, player_id, price_idr, created_at) VALUES (?, ?, 0, ?)").run(sid, player.id, new Date(Date.now() - 3 * 86_400_000).toISOString());
    return sid;
  };
  const lastMailId = () => (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  const mailsSince = (mark: number) =>
    (db.prepare("SELECT to_address, subject, body_text FROM email_outbox WHERE id > ? ORDER BY id").all(mark) as Mail[]).filter((m) => m.subject.includes(game.title) && /^(Reminder|Pengingat|Starting soon|Segera dimulai):/.test(m.subject)); // only reminder emails
  let mark = lastMailId();
  db.prepare("UPDATE users SET locale = 'id', email_reminders = 1 WHERE id = ?").run(player.id);
  const s24 = addSession(20);
  const sessions = [s24];
  try {
    // The scheduler endpoint needs the secret.
    expect((await request.get("/api/cron/reminders")).status()).toBe(401);
    expect((await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    const cron = await (await request.post("/api/cron/reminders", { headers: AUTH })).json();
    expect(cron.ok).toBe(true);
    expect(typeof cron.waitlists).toBe("number"); // expired offers are passed on here too
    expect(typeof cron.reviewPrompts).toBe("number");
    expect(typeof cron.retried).toBe("number");
    expect(cron.pruned).toEqual({ notifications: expect.any(Number), outbox: expect.any(Number), errors: expect.any(Number), uploads: expect.any(Number),
    devices: expect.any(Number), paymentChanges: expect.any(Number), loginSteps: expect.any(Number) });

    // The player (Indonesian) and the GM (English) each got exactly one 24h email.
    let mails = mailsSince(mark);
    const toPlayer = mails.filter((m) => m.to_address === "player@questboard.test");
    const toGm = mails.filter((m) => m.to_address === "gm@questboard.test");
    expect(toPlayer).toHaveLength(1);
    expect(toPlayer[0].subject).toMatch(/^Pengingat: Mercusuar di Pulau Kabut — .* WIB$/);
    expect(toPlayer[0].body_text).toContain("Batalkan kursimu");
    expect(toGm).toHaveLength(1);
    expect(toGm[0].subject).toMatch(/^Reminder: Mercusuar di Pulau Kabut — .* WIB$/);
    expect(toGm[0].body_text).toContain("Booked players: 1");

    // Running again sends nothing new.
    await request.post("/api/cron/reminders", { headers: AUTH });
    expect(mailsSince(mark)).toHaveLength(mails.length);

    // In the app, in the language the player is using now.
    await login(page, "player@questboard.test");
    await page.goto("/notifications");
    await expect(page.getByText("Reminder: Mercusuar di Pulau Kabut is coming up within 24 hours")).toBeVisible();

    // Opting out stops the emails but keeps the in-app reminder.
    await page.goto("/settings");
    await page.getByLabel(/Email me a reminder/).uncheck();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    mark = lastMailId();
    const s1 = addSession(0.5);
    sessions.push(s1);
    await request.post("/api/cron/reminders", { headers: AUTH });
    mails = mailsSince(mark);
    expect(mails.filter((m) => m.to_address === "player@questboard.test")).toHaveLength(0);
    expect(mails.filter((m) => m.to_address === "gm@questboard.test" && m.subject.startsWith("Starting soon"))).toHaveLength(1);
    await page.goto("/notifications");
    await expect(page.getByText("Mercusuar di Pulau Kabut starts within the hour — see you at the table!")).toBeVisible();
  } finally {
    for (const sid of sessions) db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.prepare("UPDATE users SET email_reminders = 1 WHERE id = ?").run(player.id);
    db.close();
  }
});
