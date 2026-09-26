import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { login, newPage } from "./helpers";

test("GM earnings: expected vs marked paid, seats to follow up, and a CSV only GMs can download", async ({ page, browser, request }) => {
  const db = new DatabaseSync("data/e2e.db");
  db.exec("PRAGMA foreign_keys = ON");
  const game = db.prepare("SELECT id, title FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number; title: string };
  const player = db.prepare("SELECT id, name FROM users WHERE email = 'player@questboard.test'").get() as { id: number; name: string };
  const past = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() - 3 * 86_400_000).toISOString()).lastInsertRowid);
  const bookingId = Number(db.prepare("INSERT INTO bookings (session_id, player_id, price_idr, created_at) VALUES (?, ?, 123000, ?)").run(past, player.id, new Date(Date.now() - 9 * 86_400_000).toISOString()).lastInsertRowid);
  try {
    await login(page, "gm@questboard.test");
    await page.goto("/gm");
    await page.getByRole("link", { name: "Earnings" }).click();
    await expect(page).toHaveURL(/\/gm\/earnings$/);
    const chase = page.locator("section", { has: page.getByRole("heading", { name: "Seats to follow up" }) });
    const mine = chase.getByRole("listitem").filter({ hasText: "Rp 123.000" });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(player.name);

    // CSV: GMs only; formula-safe cells.
    const csv = await page.request.get("/api/gm/earnings");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain(`"${game.title}","${player.name}","123000","no"`);
    expect((await request.get("/api/gm/earnings")).status()).toBe(401);
    const p = await newPage(browser);
    await login(p, "player@questboard.test");
    expect((await p.request.get("/api/gm/earnings")).status()).toBe(401);
    expect((await p.goto("/gm/earnings"))?.url()).toMatch(/become-a-gm|login/);

    // Ticking the seat as paid on the roster clears it from the follow-up list.
    await mine.getByRole("link", { name: "Open roster" }).click();
    const seat = page.locator(`form:has(input[name="bookingId"][value="${bookingId}"])`);
    await seat.getByRole("button", { name: `Mark ${player.name}'s seat as paid` }).click();
    await expect(page.locator(`form:has(input[name="bookingId"][value="${bookingId}"])`).getByRole("button", { name: `Unmark ${player.name}'s seat as paid` })).toBeVisible();
    await page.goto("/gm/earnings");
    await expect(chase.getByRole("listitem").filter({ hasText: "Rp 123.000" })).toHaveCount(0); // it now counts as paid instead
  } finally {
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(past);
    db.close();
  }
});
