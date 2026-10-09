import { test, expect } from "@playwright/test";
import { login, newPage, e2eDb } from "./helpers";

test("personal calendar feed: booked sessions, cancellations marked, and a reset kills the old link", async ({ page, browser, request }) => {
  const db = e2eDb();
  db.exec("PRAGMA foreign_keys = ON");
  const game = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const player = db.prepare("SELECT id FROM users WHERE email = 'player@questboard.test'").get() as { id: number };
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + 50 * 86_400_000).toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(sid, player.id);
  try {
    await login(page, "player@questboard.test");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Create my calendar link" }).click();
    const url = await page.getByLabel("Your private link").inputValue();
    expect(url).toMatch(/\/api\/calendar\/\d+\.[A-Za-z0-9_-]{20,}\.ics$/); // <account>.<secret> (round 38)
    await expect(page.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com\/calendar\/r\?cid=webcal/);

    const path = new URL(url).pathname;
    let ics = await (await request.get(path)).text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`UID:session-${sid}@questboard`);
    expect(ics).not.toMatch(/BCA|GoPay|rekening/i); // never payment details

    // The GM cancels: the feed keeps the event, marked cancelled.
    const gm = await newPage(browser);
    await login(gm, "gm@questboard.test");
    await gm.goto(`/gm/games/${game.id}`);
    const panel = gm.locator(`details:has(input[name="sessionId"][value="${sid}"]):has(textarea[name="reason"])`);
    await panel.locator("summary").click();
    gm.once("dialog", (d) => d.accept());
    await panel.getByRole("button", { name: "Cancel this session" }).click();
    await expect(gm.getByText("Session cancelled", { exact: false }).first()).toBeVisible();
    ics = await (await request.get(path)).text();
    const event = ics.split("BEGIN:VEVENT").find((e) => e.includes(`UID:session-${sid}@questboard`)) ?? "";
    expect(event).toContain("STATUS:CANCELLED");

    // Reset: a new link; the old one stops working.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reset link" }).click();
    await expect(page.getByLabel("Your private link")).not.toHaveValue(url);
    expect((await request.get(path)).status()).toBe(404);
    expect((await request.get("/api/calendar/12.not-a-real-token-at-all-xx.ics")).status()).toBe(404);
    // An old-form link (no account number) gets one event saying where the new link is (round 39).
    const old = await request.get("/api/calendar/not-a-real-token-at-all-xx.ics");
    expect(old.status()).toBe(200);
    expect(await old.text()).toContain("calendar link changed");
  } finally {
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.prepare("UPDATE users SET calendar_token = NULL WHERE id = ?").run(player.id);
    db.close();
  }
});
