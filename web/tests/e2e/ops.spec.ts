import { test, expect } from "@playwright/test";
import { login, newPage, e2eDb } from "./helpers";

test("health check: 200 with the schema version, nothing private", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(typeof body.schema).toBe("number");
  expect(Object.keys(body).sort()).toEqual(["ok", "schema"]);
});

test("server errors are logged and shown to admins; the launch pulse is on the admin home", async ({ page, browser }) => {
  const db = e2eDb();
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM error_log").get() as { n: number }).n;
  const mine = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const other = db.prepare("SELECT id FROM games WHERE slug = 'naga-naga-hutan-bara-petualangan-pemula'").get() as { id: number };

  // A GM tampers with the archive form to target someone else's game: the server refuses (throws).
  await login(page, "gm@questboard.test");
  await page.goto(`/gm/games/${mine.id}`);
  await page.locator('form:has(input[name="gameId"]) input[name="gameId"]').last().evaluate((el, id) => ((el as HTMLInputElement).value = String(id)), other.id);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect.poll(() => (db.prepare("SELECT COUNT(*) AS n FROM error_log WHERE id > ?").get(mark) as { n: number }).n, { timeout: 10_000 }).toBeGreaterThan(0);
  const logged = db.prepare("SELECT message, path, route_type FROM error_log WHERE id > ? ORDER BY id DESC").get(mark) as { message: string; path: string; route_type: string };
  expect(logged.message).toContain("Not found");
  expect(logged.route_type).toBe("action");
  expect(logged.path).not.toContain("?");
  expect((db.prepare("SELECT status FROM games WHERE id = ?").get(other.id) as { status: string }).status).toBe("published"); // untouched

  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Launch pulse — last 7 days" })).toBeVisible();
  await expect(admin.getByText(/server errors? this week/)).toBeVisible();
  await admin.getByRole("link", { name: "Server errors" }).first().click();
  await expect(admin.getByText(logged.message).first()).toBeVisible();
  // Non-admins can't see the log.
  expect((await page.goto("/admin/errors"))?.status()).toBe(404);
  db.close();
});

test("admins can read a question thread but don't get a reply box", async ({ page }) => {
  const db = e2eDb();
  db.exec("PRAGMA foreign_keys = ON");
  const game = db.prepare("SELECT id FROM games WHERE slug = 'signal-from-tartarus-station'").get() as { id: number };
  const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@questboard.test'").get() as { id: number };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  db.prepare("DELETE FROM game_questions WHERE game_id = ? AND player_id = ?").run(game.id, player.id);
  const qid = Number(db.prepare("INSERT INTO game_questions (game_id, player_id) VALUES (?, ?)").run(game.id, player.id).lastInsertRowid);
  db.prepare("INSERT INTO game_question_messages (question_id, user_id, body) VALUES (?, ?, 'A question for the GM')").run(qid, player.id);
  try {
    await login(page, "admin@questboard.test");
    await page.goto(`/questions/${qid}`);
    await expect(page.getByText("A question for the GM")).toBeVisible();
    await expect(page.getByPlaceholder("Write a reply…")).toHaveCount(0);
    expect(admin.id).toBeGreaterThan(0);
  } finally {
    db.prepare("DELETE FROM game_questions WHERE id = ?").run(qid);
    db.close();
  }
});
