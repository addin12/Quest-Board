import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { bookFirstOpenSeat, createGmWithGame, newPage, signup, unique } from "./helpers";

// Iteration 5: waitlist, the GM's "paid ✓" marker, recurring sessions.

test("waitlist: full session → join → a freed seat is offered to #1 and held → claimed; expired offers pass on", async ({ browser }) => {
  test.setTimeout(120_000);
  const gm = await newPage(browser);
  const slug = await createGmWithGame(gm, "Wanda Waits", unique("wait-gm"), "One Seat Only", { seats: 1 });
  const manage = gm.url();

  const a = await newPage(browser);
  await signup(a, "Ana First", unique("wait-a"));
  await bookFirstOpenSeat(a, [slug]);

  // B and C find it full and join the waitlist.
  const b = await newPage(browser);
  await signup(b, "Budi Second", unique("wait-b"));
  await b.goto(`/games/${slug}`);
  await expect(b.getByRole("link", { name: "Book" })).toHaveCount(0);
  await b.getByRole("button", { name: "Join waitlist" }).click();
  await expect(b.getByText("You're #1 on the waitlist")).toBeVisible();

  const c = await newPage(browser);
  await signup(c, "Cici Third", unique("wait-c"));
  await c.goto(`/games/${slug}`);
  await c.getByRole("button", { name: "Join waitlist" }).click();
  await expect(c.getByText("You're #2 on the waitlist")).toBeVisible();

  // A gives up the seat → B is offered it (notification + claim button); C can't take it.
  await a.goto("/dashboard");
  a.once("dialog", (d) => void d.accept());
  await a.getByRole("button", { name: "Cancel" }).first().click();
  await expect(a.getByText("One Seat Only").first()).toBeVisible();

  await b.goto("/notifications");
  await expect(b.getByText("A seat opened up at One Seat Only — it's held for you for a short time, claim it soon")).toBeVisible();
  await b.goto(`/games/${slug}`);
  await expect(b.getByRole("link", { name: "Claim your seat" })).toBeVisible();
  await expect(b.getByText(/Held for you until/)).toBeVisible();

  await c.goto(`/games/${slug}`);
  await expect(c.getByRole("link", { name: "Book" })).toHaveCount(0);
  await expect(c.getByText("You're #1 on the waitlist")).toBeVisible(); // moved up; the seat is held for B
  expect((await c.goto(`/book/${(await b.getByRole("link", { name: "Claim your seat" }).getAttribute("href"))!.split("/").pop()}`))?.status()).toBe(200);
  await expect(c.getByText(/full/i).first()).toBeVisible(); // the held seat can't be taken via the booking page either

  // B lets the offer lapse: simulate the 12 hours by moving the deadline into the past.
  const db = new DatabaseSync(path.join(process.cwd(), "data", "e2e.db"));
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("UPDATE waitlist SET expires_at = '2000-01-01T00:00:00.000Z' WHERE status = 'offered' AND session_id IN (SELECT s.id FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE g.slug = ?)").run(slug);
  db.close();

  await c.goto(`/games/${slug}`);
  await expect(c.getByRole("link", { name: "Claim your seat" })).toBeVisible(); // passed on to C
  await c.getByRole("link", { name: "Claim your seat" }).click();
  await expect(c.getByText(/A seat opened up and is held for you/)).toBeVisible();
  await c.getByRole("checkbox").check();
  await c.getByRole("button", { name: "Reserve my seat" }).click();
  await c.waitForURL("**/dashboard?booked=*");
  await expect(c.getByText(/Waitlist \(/)).toHaveCount(0); // claimed, no longer waiting

  // B lost the offer and can re-join at the back of the line.
  await b.goto(`/games/${slug}`);
  await expect(b.getByRole("button", { name: "Join waitlist" })).toBeVisible();

  // GM sees who is waiting.
  await b.getByRole("button", { name: "Join waitlist" }).click();
  await gm.goto(manage);
  await expect(gm.getByText("1 waiting")).toBeVisible();
});

test("people on a waitlist can leave it, or pass an offer to the next person", async ({ browser }) => {
  test.setTimeout(120_000); // four new accounts, each confirmed by email; slow under a full run
  const gm = await newPage(browser);
  const slug = await createGmWithGame(gm, "Lulu Leaves", unique("leave-gm"), "Tiny Table", { seats: 1 });
  const a = await newPage(browser);
  await signup(a, "Aldo Seat", unique("leave-a"));
  await bookFirstOpenSeat(a, [slug]);
  const b = await newPage(browser);
  await signup(b, "Bela Wait", unique("leave-b"));
  const c = await newPage(browser);
  await signup(c, "Caca Wait", unique("leave-c"));
  for (const p of [b, c]) {
    await p.goto(`/games/${slug}`);
    await p.getByRole("button", { name: "Join waitlist" }).click();
  }
  await b.goto("/dashboard");
  await expect(b.getByText("Waitlist (1)")).toBeVisible();

  await a.goto("/dashboard");
  a.once("dialog", (d) => void d.accept());
  await a.getByRole("button", { name: "Cancel" }).first().click();

  // B is offered the seat but passes it on → C gets it.
  await b.goto("/dashboard");
  await expect(b.getByText("A seat opened up — it's held for you.")).toBeVisible();
  await b.getByRole("button", { name: "Pass to the next person" }).click();
  await expect(b.getByText("Waitlist (1)")).toHaveCount(0);
  await c.goto(`/games/${slug}`);
  await expect(c.getByRole("link", { name: "Claim your seat" })).toBeVisible();
});

test("the player says they've paid, the GM sees it and ticks 'paid ✓'; the player sees it and is notified", async ({ browser }) => {
  test.setTimeout(120_000); // three accounts and two GM games: past 60 s on a busy machine
  const gm = await newPage(browser);
  const slug = await createGmWithGame(gm, "Paolo Paid", unique("paid-gm"), "Paid Table", { price: "50.000" });
  const manage = gm.url();
  const player = await newPage(browser);
  await signup(player, "Pipit Pays", unique("paid-p"));
  await bookFirstOpenSeat(player, [slug]);

  // Round 37: the player says it's sent (and can take it back); the GM is told and sees "Says paid".
  await player.goto("/dashboard");
  await player.getByRole("button", { name: "I've sent the payment" }).click();
  await expect(player.getByText("You told the GM you've paid. Waiting for them to confirm.")).toBeVisible();
  await player.getByTestId("player-paid").getByRole("button", { name: "Undo" }).click();
  await expect(player.getByRole("button", { name: "I've sent the payment" })).toBeVisible();
  await player.getByRole("button", { name: "I've sent the payment" }).click();
  await expect(player.getByText("You told the GM you've paid.", { exact: false })).toBeVisible();

  await gm.goto("/notifications");
  await expect(gm.getByText("Pipit Pays says they've sent the payment for Paid Table. Check and mark it paid.")).toBeVisible();
  await gm.goto(manage);
  await expect(gm.getByText("0/1 paid")).toBeVisible();
  await expect(gm.getByTestId("says-paid")).toHaveText(/Says paid/);
  await gm.getByRole("button", { name: "Mark Pipit Pays's seat as paid" }).click();
  await expect(gm.getByTestId("says-paid")).toHaveCount(0);
  await expect(gm.getByRole("button", { name: "Unmark Pipit Pays's seat as paid" })).toHaveAttribute("aria-pressed", "true");
  await expect(gm.getByText("1/1 paid")).toBeVisible();

  await player.goto("/dashboard");
  await expect(player.getByText("The GM confirmed your payment")).toBeVisible();
  await expect(player.getByTestId("player-paid")).toHaveCount(0); // nothing left to say once the GM confirmed
  await player.goto("/notifications");
  await expect(player.getByText("Paolo Paid marked your seat at Paid Table as paid")).toBeVisible();

  // Free games have no paid toggle.
  const gm2 = await newPage(browser);
  await createGmWithGame(gm2, "Freya Free", unique("free-gm"), "Free Table");
  await expect(gm2.getByText(/paid$/)).toHaveCount(0);
});

test("GMs can schedule a weekly series in one go", async ({ page }) => {
  await createGmWithGame(page, "Rita Repeat", unique("repeat-gm"), "Weekly Campaign");
  await expect(page.getByRole("heading", { name: "Upcoming sessions (1)" })).toBeVisible();
  const first = new Date(Date.now() + 9 * 86_400_000);
  const local = new Date(first.getTime() - first.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel(/Date & time/).fill(local);
  await page.getByLabel("Repeat").selectOption("4");
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(page.getByText("4 weekly sessions added.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming sessions (5)" })).toBeVisible();
});
