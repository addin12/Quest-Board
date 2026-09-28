import { test, expect } from "@playwright/test";
import { createGmWithGame, e2eDb, login, newPage, signup, unique } from "./helpers";

// Iteration 6: Tavern Notice Board, saved games, following GMs.

test("pin a notice, filter the board, reply (author notified), take it down", async ({ browser }) => {
  const author = await newPage(browser);
  await login(author, "fajar@questboard.test");
  await author.goto("/board");
  await expect(author.getByRole("heading", { level: 1, name: "Tavern Notice Board" })).toBeVisible();
  await author.getByRole("link", { name: "Pin a notice" }).click();
  await expect(author.getByRole("heading", { level: 1, name: "Pin a notice" })).toBeVisible();

  // Validation first.
  await author.getByRole("button", { name: "Pin to the board" }).click();
  await expect(author.getByText("Write a short title (5–80 characters).")).toBeVisible();

  await author.getByLabel("Looking for players").check();
  await author.getByLabel("Headline").fill("Two investigators wanted in Bandung");
  await author.getByLabel("Game system").fill("Call of Cthulhu");
  await author.getByLabel("Open spots").fill("2");
  await author.getByLabel("Location", { exact: true }).selectOption("in_person");
  await author.getByLabel("City").fill("Bandung");
  await author.getByLabel("When can you play?").fill("Saturday evenings");
  await author.getByLabel("About you and what you want to play").fill("Three of us play 1920s horror at a café in Dago. Beginners welcome!");
  await author.getByRole("button", { name: "Pin to the board" }).click();
  await author.waitForURL(/\/board\/\d+\?posted=1/);
  await expect(author.getByText(/Your notice is on the board/)).toBeVisible();
  const noticeUrl = author.url().replace(/\?.*$/, "");

  // It shows on the board, and filters work.
  const visitor = await newPage(browser);
  await visitor.goto("/board?kind=lf_players");
  await expect(visitor.getByRole("link", { name: /Two investigators wanted in Bandung/ })).toBeVisible();
  await visitor.goto("/board?kind=lf_group");
  await expect(visitor.getByRole("link", { name: /Two investigators wanted in Bandung/ })).toHaveCount(0);
  await visitor.goto("/board?where=Surabaya");
  await expect(visitor.getByRole("link", { name: /Two investigators wanted in Bandung/ })).toHaveCount(0);
  await visitor.goto("/board?where=Bandung&q=cthulhu");
  await visitor.getByRole("link", { name: /Two investigators wanted in Bandung/ }).click();
  await expect(visitor.getByRole("link", { name: "Log in to reply" })).toBeVisible();

  // A player replies; the author is notified.
  const replier = await newPage(browser);
  await login(replier, "citra@questboard.test");
  await replier.goto(noticeUrl);
  await replier.getByLabel("Your reply").fill("I'd love to join — free most Saturdays!");
  await replier.getByRole("button", { name: "Reply" }).click();
  await expect(replier.getByText("I'd love to join — free most Saturdays!")).toBeVisible();
  await expect(replier.getByRole("heading", { name: "1 reply" })).toBeVisible();

  await author.goto("/notifications");
  await expect(author.getByText("Citra Ayu replied to your notice “Two investigators wanted in Bandung”")).toBeVisible();

  // The author takes it down: gone from the board, replies closed.
  await author.goto(noticeUrl);
  author.once("dialog", (d) => void d.accept());
  await author.getByRole("button", { name: "Take it down" }).click();
  await expect(author.getByText("The author has taken this notice down.")).toBeVisible();
  await visitor.goto("/board");
  await expect(visitor.getByRole("link", { name: /Two investigators wanted in Bandung/ })).toHaveCount(0);
  await replier.goto(noticeUrl);
  await expect(replier.getByLabel("Your reply")).toHaveCount(0);
  expect((await visitor.goto(noticeUrl))?.status()).toBe(404); // strangers can't read a taken-down notice
});

test("unverified accounts can read the board but can't pin notices", async ({ page }) => {
  await signup(page, "Una Unverified", unique("board-unverified"));
  await page.goto("/board/new");
  await expect(page.getByText(/Verify your email first/).first()).toBeVisible();
});

test("save a game to My games; follow a GM and hear about their next game", async ({ browser }) => {
  const player = await newPage(browser);
  await signup(player, "Sasa Saver", unique("saver"));
  await player.goto("/games/panen-harapan");
  await player.getByRole("button", { name: "Save" }).click();
  await expect(player.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await player.goto("/dashboard");
  await expect(player.getByRole("heading", { name: "Saved games (1)" })).toBeVisible();
  await expect(player.getByRole("link", { name: /Panen Harapan/ })).toBeVisible();

  // A new GM; the player follows them.
  const gmEmail = unique("followed-gm");
  const gm = await newPage(browser);
  await createGmWithGame(gm, "Fina Followed", gmEmail, "First Light");
  await gm.goto("/games/first-light");
  const gmProfile = (await gm.getByRole("link", { name: /Fina Followed/ }).first().getAttribute("href"))!;

  await player.goto(gmProfile);
  await expect(player.getByText("0 followers")).toBeVisible();
  await player.getByRole("button", { name: "Follow" }).click();
  await expect(player.getByRole("button", { name: "Following" })).toBeVisible();
  await expect(player.getByText("1 follower")).toBeVisible();

  // Their next published game reaches the follower (once).
  await gm.goto("/gm/games/new");
  await gm.getByLabel("Title").fill("Second Dawn");
  await gm.getByLabel("Game system").fill("Daggerheart");
  await gm.getByLabel("One-line summary").fill("A hopeful fantasy one-shot about a new day.");
  await gm.getByLabel("Full description").fill("A warm Daggerheart adventure for new players. Characters provided, three hours.");
  await gm.getByLabel("Platform(s)").fill("Discord");
  await gm.getByLabel("Price per seat, per session").fill("0");
  await gm.getByRole("button", { name: "Create game" }).click();
  await gm.waitForURL(/\/gm\/games\/\d+$/);

  await player.goto("/notifications");
  await expect(player.getByText("Fina Followed has a new game: Second Dawn")).toHaveCount(1);
  await player.goto("/dashboard");
  await expect(player.getByRole("heading", { name: "GMs you follow (1)" })).toBeVisible();

  // Unfollow / unsave.
  await player.goto(gmProfile);
  await player.getByRole("button", { name: "Following" }).click();
  await expect(player.getByText("0 followers")).toBeVisible();
  await player.goto("/games/panen-harapan");
  await player.getByRole("button", { name: "Saved" }).click();
  await player.goto("/dashboard");
  await expect(player.getByRole("heading", { name: /Saved games/ })).toHaveCount(0);
});

test("notices and replies can be reported, and an admin can remove them", async ({ browser }) => {
  const author = await newPage(browser);
  await login(author, "intan@questboard.test");
  await author.goto("/board/new");
  await author.getByLabel("Looking for a group").check();
  await author.getByLabel("Headline").fill("Selling cheap dice, DM me");
  await author.getByLabel("When can you play?").fill("anytime");
  await author.getByLabel("About you and what you want to play").fill("Not really a notice about playing, just advertising my shop.");
  await author.getByRole("button", { name: "Pin to the board" }).click();
  await author.waitForURL(/\/board\/\d+/);
  const url = author.url().replace(/\?.*$/, "");

  const reporter = await newPage(browser);
  await login(reporter, "player@questboard.test");
  await reporter.goto(url);
  await reporter.locator("summary", { hasText: "Report" }).first().click();
  await reporter.getByLabel("Spam or advertising").check();
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.getByText("Thanks — our moderators will take a look.")).toBeVisible();

  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto("/admin/reports");
  const card = admin.getByRole("listitem").filter({ hasText: "Selling cheap dice" });
  await expect(card.getByRole("heading", { name: /Notice · Spam or advertising/i })).toBeVisible();
  await card.getByRole("button", { name: "Remove content" }).click();
  await expect(card).toHaveCount(0);
  expect((await reporter.goto(url))?.status()).toBe(404);
});

test("the author can edit a notice, and keep it up when it's about to come down", async ({ browser }) => {
  const author = await newPage(browser);
  await login(author, "fajar@questboard.test");
  await author.goto("/board/new");
  await author.getByLabel("Looking for players").check();
  await author.getByLabel("Headline").fill("Three players for a pirate campaign");
  await author.getByLabel("Open spots").fill("3");
  await author.getByLabel("When can you play?").fill("Sunday afternoons");
  await author.getByLabel("About you and what you want to play").fill("A swashbuckling online campaign, beginners very welcome.");
  await author.getByRole("button", { name: "Pin to the board" }).click();
  await author.waitForURL(/\/board\/\d+\?posted=1/);
  const id = Number(new URL(author.url()).pathname.split("/").pop());

  // Found one player: fewer spots, new schedule.
  await expect(author.getByText(/On the board until/)).toBeVisible();
  await expect(author.getByRole("button", { name: /Keep it up/ })).toHaveCount(0); // not yet: a month to go
  await author.getByRole("link", { name: "Edit notice" }).click();
  await expect(author.getByLabel("Headline")).toHaveValue("Three players for a pirate campaign");
  await author.getByLabel("Headline").fill("Two players for a pirate campaign");
  await author.getByLabel("Open spots").fill("2");
  await author.getByRole("button", { name: "Save changes" }).click();
  await author.waitForURL(`**/board/${id}?edited=1`);
  await expect(author.getByText("Notice updated.")).toBeVisible();
  await expect(author.getByRole("heading", { level: 1, name: "Two players for a pirate campaign" })).toBeVisible();
  await expect(author.getByText("2 spots open")).toBeVisible();

  // Two days before it comes down, the author can keep it up for another 30 days.
  const db = e2eDb();
  db.prepare("UPDATE lfg_posts SET expires_at = ? WHERE id = ?").run(new Date(Date.now() + 2 * 86_400_000).toISOString(), id);
  await author.reload();
  await author.getByRole("button", { name: "Keep it up 30 more days" }).click();
  await expect(author.getByText("Your notice stays up for another 30 days.")).toBeVisible();
  const { expires_at } = db.prepare("SELECT expires_at FROM lfg_posts WHERE id = ?").get(id) as { expires_at: string };
  db.close();
  expect(Date.parse(expires_at) - Date.now()).toBeGreaterThan(29 * 86_400_000);

  // Nobody else can edit it.
  const other = await newPage(browser);
  await login(other, "player@questboard.test");
  await other.goto(`/board/${id}`);
  await expect(other.getByRole("link", { name: "Edit notice" })).toHaveCount(0);
  expect((await other.goto(`/board/${id}/edit`))?.status()).toBe(404);
});
