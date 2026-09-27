import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { login, newPage } from "./helpers";

test("a GM cancels a session with a message: players see it in the bell, on My games and by email", async ({ page, browser }) => {
  const db = new DatabaseSync("data/e2e.db");
  const game = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + 40 * 86_400_000).toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(sid, player.id);
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  try {
    await login(page, "gm@questboard.test");
    await page.goto(`/gm/games/${game.id}`);
    const panel = page.locator(`details:has(input[name="sessionId"][value="${sid}"])`);
    await panel.locator("summary").click();
    await panel.getByLabel("Message to your players (optional)").fill("I'm ill — let's move to next Saturday.");
    page.once("dialog", (d) => d.accept());
    await panel.getByRole("button", { name: "Cancel this session" }).click();
    await expect(page.getByText("Session cancelled", { exact: false }).first()).toBeVisible();

    const status = db.prepare("SELECT status, cancel_reason FROM game_sessions WHERE id = ?").get(sid) as { status: string; cancel_reason: string };
    expect(status).toEqual({ status: "cancelled", cancel_reason: "I'm ill — let's move to next Saturday." });
    const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = 'player@questboard.test' AND subject LIKE 'Cancelled:%'").get(mark) as { subject: string; body_text: string };
    expect(mail.subject).toMatch(/Mercusuar di Pulau Kabut/);
    expect(mail.body_text).toContain("I'm ill — let's move to next Saturday.");

    const p = await newPage(browser);
    await login(p, "player@questboard.test");
    await p.goto("/notifications");
    await expect(p.getByText("I'm ill — let's move to next Saturday.").first()).toBeVisible();
    await p.goto("/dashboard");
    await expect(p.getByText("“I'm ill — let's move to next Saturday.”")).toBeVisible();
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.close();
  }
});

test("a GM duplicates a game: a draft copy without sessions, ready to edit", async ({ page }) => {
  await login(page, "gm@questboard.test");
  const db = new DatabaseSync("data/e2e.db");
  const game = db.prepare("SELECT id, title FROM games WHERE slug = 'signal-from-tartarus-station'").get() as { id: number; title: string };
  await page.goto(`/gm/games/${game.id}`);
  await page.getByRole("button", { name: "Duplicate game" }).click();
  await expect(page).toHaveURL(/\/gm\/games\/\d+\/edit$/);
  await expect(page.getByLabel("Title")).toHaveValue(`${game.title} (copy)`);
  const copyId = Number(page.url().match(/games\/(\d+)\/edit/)![1]);
  const copy = db.prepare("SELECT status, system, summary, (SELECT COUNT(*) FROM game_sessions WHERE game_id = games.id) AS sessions FROM games WHERE id = ?").get(copyId) as { status: string; sessions: number; system: string; summary: string };
  const orig = db.prepare("SELECT system, summary FROM games WHERE id = ?").get(game.id) as { system: string; summary: string };
  expect(copy.status).toBe("draft");
  expect(copy.sessions).toBe(0);
  expect({ system: copy.system, summary: copy.summary }).toEqual(orig);
  // A draft isn't public.
  const slug = (db.prepare("SELECT slug FROM games WHERE id = ?").get(copyId) as { slug: string }).slug;
  expect((await page.request.get(`/api/games/${slug}`)).status()).toBe(404);
  db.prepare("DELETE FROM games WHERE id = ?").run(copyId);
  db.close();
});
