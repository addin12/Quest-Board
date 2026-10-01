import { test, expect, type Page } from "@playwright/test";
import { confirmLink, e2eDb, login } from "./helpers";

// Keyboard only: the newest flows can be finished with Tab / Enter / arrow keys and typing — no mouse —
// and every stop on the way shows a visible focus ring.
test.describe.configure({ timeout: 120_000 });

type Stop = { label: string; ring: boolean };

/** The focused element: a short label, and whether it shows a focus indicator (outline or ring). */
async function focused(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { label: "(body)", ring: true };
    const s = getComputedStyle(el);
    const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== "none" && /rgb/.test(s.boxShadow));
    const label = (el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).name || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60);
    return { label: `${el.tagName.toLowerCase()} “${label}”`, ring };
  });
}

/** Press Tab until the focused element's label includes `text` (fails after `max` presses). Records every stop. */
async function tabTo(page: Page, text: string, stops: Stop[], max = 150) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    stops.push(f);
    if (f.label.includes(text)) return;
  }
  throw new Error(`“${text}” is not reachable with Tab (last stops: ${stops.slice(-5).map((s) => s.label).join(" → ")})`);
}

const noRing = (stops: Stop[]) => stops.filter((s) => !s.ring).map((s) => s.label);

test("keyboard only: confirm a new account, and reply to a review as the GM", async ({ page, browser }) => {
  const stops: Stop[] = [];
  // Sign up by keyboard, then confirm from the emailed link.
  const email = `keys-${Date.now()}@questboard.test`;
  await page.goto("/signup");
  await page.getByLabel("Display name").focus(); // then only the keyboard
  await page.keyboard.type("Kiki Keys");
  await page.keyboard.press("Tab");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type("tavern-demo-42");
  await tabTo(page, "Create account", stops);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/signup/check-email");
  await page.goto(await confirmLink(email));
  await tabTo(page, "Confirm my email", stops);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/dashboard");

  // The GM answers a review.
  const gm = await (await browser.newContext()).newPage();
  await login(gm, "gm@questboard.test");
  await gm.goto("/games/mercusuar-di-pulau-kabut");
  await gm.locator("#reviews-h").scrollIntoViewIfNeeded();
  await gm.locator("h1").focus(); // start from the top of the content, like a keyboard user would
  await tabTo(gm, "Reply as the GM", stops);
  await gm.keyboard.press("Enter"); // opens the panel
  await gm.keyboard.press("Tab");
  expect((await focused(gm)).label).toContain("textarea");
  await gm.keyboard.type("Thanks for playing — see you at the next session!");
  await tabTo(gm, "Save reply", stops, 5);
  await gm.keyboard.press("Enter");
  await expect(gm.getByText("Your reply is up.")).toBeVisible();

  expect(noRing(stops)).toEqual([]);
  const db = e2eDb();
  db.prepare("UPDATE reviews SET gm_reply = '', gm_replied_at = NULL WHERE gm_reply = 'Thanks for playing — see you at the next session!'").run();
  db.close();
});

test("keyboard only: a GM removes a player; an author edits a notice and keeps it up", async ({ page, browser }) => {
  const stops: Stop[] = [];
  const db = e2eDb();
  const game = db.prepare("SELECT id FROM games WHERE slug = 'mercusuar-di-pulau-kabut'").get() as { id: number };
  const citra = db.prepare("SELECT id FROM users WHERE email = 'citra@questboard.test'").get() as { id: number };
  const sid = Number(db.prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game.id, new Date(Date.now() + 20 * 86_400_000).toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(sid, citra.id);
  const notice = Number(db.prepare("INSERT INTO lfg_posts (author_id, kind, title, schedule, body, expires_at) VALUES (?, 'lf_group', 'Keyboard notice', 'Fridays', 'A friendly group for Friday nights, all welcome.', ?)").run(citra.id, new Date(Date.now() + 2 * 86_400_000).toISOString()).lastInsertRowid);
  try {
    await login(page, "gm@questboard.test");
    await page.goto(`/gm/games/${game.id}`);
    const card = page.locator(".card", { has: page.locator(`select#remove-${sid}`) });
    await card.locator("summary", { hasText: "Remove a player" }).focus();
    stops.push(await focused(page));
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab"); // the player list
    expect((await focused(page)).label).toContain("select");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Sorry, this table is full of regulars.");
    await tabTo(page, "Remove from this session", stops, 5);
    page.once("dialog", (d) => void d.accept());
    await page.keyboard.press("Enter");
    await expect(page.getByText("The player was removed and told.", { exact: false })).toBeVisible();

    const author = await (await browser.newContext()).newPage();
    await login(author, "citra@questboard.test");
    await author.goto(`/board/${notice}`);
    await author.locator("h1").focus();
    await author.keyboard.press("Shift+Tab"); // the author's bar sits above the notice
    await tabTo(author, "Keep it up", stops, 40);
    await author.keyboard.press("Enter");
    await expect(author.getByText("Your notice stays up for another 30 days.")).toBeVisible();
    await author.locator("h1").focus();
    await author.keyboard.press("Shift+Tab");
    await tabTo(author, "Edit notice", stops, 40);
    await author.keyboard.press("Enter");
    await author.waitForURL(`**/board/${notice}/edit`);
    await author.getByLabel("Headline").focus();
    await author.keyboard.press("Control+A");
    await author.keyboard.type("Keyboard notice, edited");
    await tabTo(author, "Save changes", stops, 40);
    await author.keyboard.press("Enter");
    await author.waitForURL(`**/board/${notice}?edited=1`);
    await expect(author.getByRole("heading", { level: 1, name: "Keyboard notice, edited" })).toBeVisible();

    expect(noRing(stops)).toEqual([]);
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM game_sessions WHERE id = ?").run(sid);
    db.prepare("DELETE FROM lfg_posts WHERE id = ?").run(notice);
    db.close();
  }
});
