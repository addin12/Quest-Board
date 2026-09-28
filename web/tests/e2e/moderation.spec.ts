import { test, expect } from "@playwright/test";
import { bookFirstOpenSeat, createGmWithGame, e2eDb, login, newPage, signup, unique } from "./helpers";

// Iteration 4: reports and the admin console.

test("the admin console is invisible to everyone but admins", async ({ page, request }) => {
  expect((await request.get("/admin")).status()).toBe(404);
  await login(page, "gm@questboard.test");
  for (const path of ["/admin", "/admin/reports", "/admin/gms", "/admin/users"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("reporting a review: validation, no self-reports, no duplicates; the admin removes it and the reporter is told", async ({ browser }) => {
  const reporter = await newPage(browser);
  await login(reporter, "player@questboard.test");
  await reporter.goto("/games/mercusuar-di-pulau-kabut");
  const reviews = reporter.getByRole("region", { name: /Reviews/ });
  // Someone else's review (Andi may have reviewed this game in an earlier test; own reviews have no Report).
  const reportable = (scope: typeof reviews) => scope.getByRole("listitem").filter({ has: reporter.locator("summary", { hasText: "Report" }) });
  // Its body: the paragraph after the name line, skipping the date (which is a <time>).
  const reviewText = ((await reportable(reviews).first().locator("p:not(:has(time))").nth(1).textContent()) ?? "").trim();
  // Pin the review by its text: once reported, its Report toggle turns into a thank-you note.
  const firstReview = reviews.getByRole("listitem").filter({ hasText: reviewText.slice(0, 30) }).first();
  expect(reviewText.length).toBeGreaterThan(5);

  await firstReview.locator("summary", { hasText: "Report" }).click();
  await firstReview.getByRole("button", { name: "Send report" }).click();
  await expect(firstReview.getByText("Choose a reason.")).toBeVisible();
  await firstReview.getByLabel("Something else").check();
  await firstReview.getByRole("button", { name: "Send report" }).click();
  await expect(firstReview.getByText("Describe the problem in 10–1000 characters.")).toBeVisible();
  await firstReview.getByLabel("Spam or advertising").check();
  await firstReview.getByLabel("Details (optional)").fill("This review advertises another site.");
  await firstReview.getByRole("button", { name: "Send report" }).click();
  await expect(firstReview.getByText("Thanks — our moderators will take a look.")).toBeVisible();

  // Same review again → duplicate.
  await reporter.reload();
  const again = reporter.getByRole("region", { name: /Reviews/ }).getByRole("listitem").filter({ hasText: reviewText.slice(0, 30) }).first();
  await again.locator("summary", { hasText: "Report" }).click();
  await again.getByLabel("Spam or advertising").check();
  await again.getByRole("button", { name: "Send report" }).click();
  await expect(again.getByText(/already reported this/)).toBeVisible();

  // The admin is notified and sees the snapshot.
  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.getByRole("button", { name: /^Notifications/ }).click();
  await expect(admin.getByRole("region", { name: "Notifications" }).getByText("Andi Wijaya sent a new report").first()).toBeVisible(); // other specs may have reported too
  await admin.getByRole("link", { name: "Admin" }).click();
  await admin.getByRole("link", { name: /^Reports/ }).click();
  const card = admin.getByRole("listitem").filter({ hasText: "Spam or advertising" }).first();
  await expect(card.getByText(reviewText.slice(0, 30), { exact: false })).toBeVisible();
  await expect(card.getByText("This review advertises another site.")).toBeVisible();
  await card.getByLabel(/Note/).fill("Advertising");
  await card.getByRole("button", { name: "Remove content" }).click();
  await expect(admin.getByText("Nothing here")).toBeVisible();

  await admin.goto("/admin/reports?status=resolved");
  await expect(admin.getByText(/Decision: removed by Admin Quest Board/).first()).toBeVisible();

  // The review is gone; the reporter got a notification.
  await reporter.goto("/games/mercusuar-di-pulau-kabut");
  await expect(reporter.getByText(reviewText.slice(0, 30), { exact: false })).toHaveCount(0);
  await reporter.goto("/notifications");
  await expect(reporter.getByText("Thanks — a moderator reviewed your report.").first()).toBeVisible();

  // The review's author is told why (with a link to the rules), and the decision is in the moderator log.
  const db = e2eDb();
  const told = db.prepare(
    "SELECT u.email FROM notifications n JOIN users u ON u.id = n.user_id JOIN reports r ON r.id = n.report_id WHERE n.kind = 'content_removed' AND r.note = 'Advertising' ORDER BY n.id DESC",
  ).get() as { email: string } | undefined;
  db.close();
  expect(told?.email).toBeTruthy();
  const author = await newPage(browser);
  await login(author, told!.email);
  await author.goto("/notifications");
  await author.getByRole("link", { name: /A moderator removed your review because it broke the community guidelines/ }).first().click();
  await expect(author).toHaveURL(/\/terms#s6$/);
  await expect(author.getByRole("heading", { name: "6. Community conduct" })).toBeInViewport();
  await admin.goto("/admin");
  const log = admin.getByRole("region", { name: "Recent moderator actions" });
  await expect(log.getByText(/Admin Quest Board removed content by .+ · review #\d+ — Advertising/).first()).toBeVisible();
});

test("people can't report their own content", async ({ page }) => {
  await login(page, "gm@questboard.test");
  await page.goto("/games/mercusuar-di-pulau-kabut"); // Raka's own game and welcome message
  // Other people's reviews can be reported, but not the GM's own game or own chat message.
  const all = await page.locator("summary", { hasText: "Report" }).count();
  const inReviews = await page.getByRole("region", { name: /Reviews/ }).locator("summary", { hasText: "Report" }).count();
  expect(all).toBe(inReviews);
  await page.goto("/gms/1");
  await expect(page.locator("summary", { hasText: "Report" })).toHaveCount(0);
});

test("a scam report leads to suspension: login blocked, profile hidden, game archived, players told", async ({ browser }) => {
  test.setTimeout(90_000); // several accounts and the whole moderation flow; slow under a full run
  const gmEmail = unique("scammer");
  const gm = await newPage(browser);
  const slug = await createGmWithGame(gm, "Sam Scammer", gmEmail, "Too Good To Be True");
  await gm.goto(`/games/${slug}`);
  const gmProfile = (await gm.getByRole("link", { name: /Sam Scammer/ }).first().getAttribute("href"))!;

  const player = await newPage(browser);
  await signup(player, "Pia Player", unique("victim"));
  await bookFirstOpenSeat(player, [slug]);
  await player.goto(`/games/${slug}`);
  await player.locator("summary", { hasText: "Report" }).first().click();
  await player.getByLabel("Scam or fake payment details").check();
  await player.getByLabel("Details (optional)").fill("Asked me to pay a different account by DM.");
  await player.getByRole("button", { name: "Send report" }).click();
  await expect(player.getByText("Thanks — our moderators will take a look.")).toBeVisible();

  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto("/admin/reports");
  const card = admin.getByRole("listitem").filter({ hasText: "Too Good To Be True" });
  admin.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Suspend Sam Scammer" }).click();
  await expect(card).toHaveCount(0);

  // Suspended: signed out and can't log back in.
  await gm.goto("/gm");
  await expect(gm).toHaveURL(/\/login/);
  await gm.getByLabel("Email").fill(gmEmail);
  await gm.getByLabel("Password", { exact: true }).fill("password123");
  await gm.getByRole("button", { name: "Log in" }).click();
  await expect(gm.getByText(/This account is suspended/)).toBeVisible();

  // Game archived, player notified, profile hidden, listed as suspended for admins.
  expect((await player.goto(`/games/${slug}`))?.status()).toBe(404);
  await player.goto("/notifications");
  await expect(player.getByText("The GM cancelled a session of Too Good To Be True that you had booked")).toBeVisible();
  // …and warned not to pay the suspended GM.
  await expect(player.getByText("Quest Board moderators suspended the GM Sam Scammer. Don't send them any money.", { exact: false })).toBeVisible();
  expect((await player.goto(gmProfile))?.status()).toBe(404);
  await admin.goto(`/admin/users?q=${encodeURIComponent(gmEmail)}`);
  await expect(admin.getByRole("row").filter({ hasText: "Sam Scammer" }).getByText("Suspended").filter({ visible: true })).toBeVisible();

  // Unsuspend restores login (games stay archived).
  await admin.getByRole("button", { name: "Unsuspend Sam Scammer" }).click();
  await expect(admin.getByRole("row").filter({ hasText: "Sam Scammer" }).getByText("Suspended").filter({ visible: true })).toHaveCount(0);
  await login(gm, gmEmail);
});

test("admins verify Game Masters, which shows the badge publicly", async ({ browser }) => {
  const email = unique("newgm");
  const gm = await newPage(browser);
  await createGmWithGame(gm, "Vivi Verified", email, "Badge Quest");
  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto(`/admin/gms?q=${encodeURIComponent(email)}`);
  await admin.getByRole("button", { name: "Verify Vivi Verified" }).click();
  await expect(admin.getByRole("button", { name: "Remove the verified badge from Vivi Verified" })).toBeVisible();
  await admin.getByRole("row").filter({ hasText: "Vivi Verified" }).getByRole("link", { name: "Vivi Verified" }).click();
  await expect(admin.getByRole("heading", { level: 1 }).getByRole("img", { name: /Verified/ })).toBeVisible();
});

test("admins can remove content directly, without a report; others don't see the button", async ({ browser }) => {
  const db = e2eDb();
  const fajar = db.prepare("SELECT id FROM users WHERE email = 'fajar@questboard.test'").get() as { id: number };
  const post = Number(db.prepare("INSERT INTO lfg_posts (author_id, kind, title, schedule, body, expires_at) VALUES (?, 'lf_group', 'Cheap dice, click here', 'Always', 'Buy the cheapest dice from my shop, link in bio, hurry now!', ?)").run(fajar.id, new Date(Date.now() + 10 * 86_400_000).toISOString()).lastInsertRowid);
  try {
    const player = await newPage(browser);
    await login(player, "player@questboard.test");
    await player.goto(`/board/${post}`);
    await expect(player.getByRole("button", { name: "Remove (moderator)" })).toHaveCount(0);

    const admin = await newPage(browser);
    await login(admin, "admin@questboard.test");
    await admin.goto(`/board/${post}`);
    admin.once("dialog", (d) => void d.accept());
    await admin.getByRole("button", { name: "Remove (moderator)" }).first().click();
    await expect(admin.getByText("Removed. The author was told", { exact: false })).toBeVisible();
    expect(db.prepare("SELECT 1 FROM lfg_posts WHERE id = ?").get(post)).toBeUndefined();

    const author = await newPage(browser);
    await login(author, "fajar@questboard.test");
    await author.goto("/notifications");
    await expect(author.getByText("A moderator removed your notice because it broke the community guidelines").first()).toBeVisible();
    await admin.goto("/admin");
    await expect(admin.getByRole("region", { name: "Recent moderator actions" }).getByText(/removed content by Fajar/).first()).toBeVisible();
  } finally {
    db.prepare("DELETE FROM lfg_posts WHERE id = ?").run(post);
    db.close();
  }
});
