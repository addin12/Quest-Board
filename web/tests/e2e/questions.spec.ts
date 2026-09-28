import { test, expect } from "@playwright/test";
import { login, newPage, signup, unique, e2eDb } from "./helpers";

test("questions before booking: a private player ↔ GM thread with notifications", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const db = e2eDb();
  db.exec("PRAGMA foreign_keys = ON");
  const game = db.prepare("SELECT id, title FROM games WHERE slug = 'signal-from-tartarus-station'").get() as { id: number; title: string };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  db.prepare("DELETE FROM game_questions WHERE game_id = ? AND player_id = ?").run(game.id, player.id);
  try {
    // Player asks from the game page.
    await login(page, "player@questboard.test");
    await page.goto("/games/signal-from-tartarus-station");
    await page.getByRole("link", { name: "Ask the GM a question" }).click();
    await expect(page).toHaveURL(/\/games\/signal-from-tartarus-station\/ask$/);
    await page.getByLabel("Your question").fill("Is this okay for someone who has never played Mothership?");
    // Mark the outbox first: the email can go out as soon as the question is saved (the page-load fallback).
    const outboxMark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page).toHaveURL(/\/questions\/\d+\?sent=1$/);
    const threadUrl = page.url().replace(/\?.*$/, "");
    await expect(page.getByText(/^Sent\./)).toBeVisible();
    // The GM also gets it by email (queued with the notification, sent by the cron or the fallback).
    await page.request.post("/api/cron/reminders", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    await expect.poll(() => (db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE id > ? AND to_address = 'gm@questboard.test' AND subject LIKE ?").get(outboxMark, `%sent a message about ${game.title}%`) as { n: number }).n).toBeGreaterThan(0);
    // Asking again reopens the same thread.
    await page.goto("/games/signal-from-tartarus-station/ask");
    await expect(page).toHaveURL(threadUrl);

    // The GM is notified, sees it awaiting a reply, and answers.
    const gm = await newPage(browser);
    await login(gm, "gm@questboard.test");
    await gm.goto("/notifications");
    await expect(gm.getByText(`sent a message about ${game.title}`).first()).toBeVisible();
    await gm.goto("/gm/questions");
    const row = gm.getByRole("link", { name: /Is this okay for someone who has never played/ });
    await expect(row.getByText("Awaiting your reply")).toBeVisible();
    await row.click();
    await gm.getByPlaceholder("Write a reply…").fill("Absolutely — I teach the rules as we play.");
    await gm.getByRole("button", { name: "Send" }).click();
    await expect(gm.getByText("Absolutely — I teach the rules as we play.")).toBeVisible();
    await gm.goto("/gm/questions");
    await expect(gm.getByText("Awaiting your reply")).toHaveCount(0);
    // The GM opening their own game's ask page lands in the inbox.
    await gm.goto("/games/signal-from-tartarus-station/ask");
    await expect(gm).toHaveURL(/\/gm\/questions$/);

    // The player sees the reply on My games.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "My questions to GMs" })).toBeVisible();
    await expect(page.getByText("New reply")).toBeVisible();

    // Strangers can't open it; unverified accounts can't start one.
    const stranger = await newPage(browser);
    await signup(stranger, "Curious Stranger", unique("stranger"), false, { confirm: false });
    expect((await stranger.goto(threadUrl))?.status()).toBe(404);
    await stranger.goto("/games/signal-from-tartarus-station/ask");
    await expect(stranger.getByText(/verify/i).first()).toBeVisible();
    await expect(stranger.getByRole("button", { name: "Send question" })).toHaveCount(0);
  } finally {
    db.prepare("DELETE FROM game_questions WHERE game_id = ? AND player_id = ?").run(game.id, player.id);
    db.close();
  }
});
