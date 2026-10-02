import { test, expect } from "@playwright/test";
import { bookFirstOpenSeat, createGmWithGame, login, newPage, signup, unique, e2eDb } from "./helpers";

test("new GMs get a getting-started checklist; set-up GMs don't", async ({ page, browser }) => {
  await signup(page, "Fresh Game Master", unique("fresh-gm"), true);
  await page.goto("/gm");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Get your table ready" }) });
  await expect(card.getByText("1 of 6 done")).toBeVisible(); // the email was confirmed at sign-up
  await card.getByRole("link", { name: "Write your GM profile (headline and about you)" }).click();
  await expect(page).toHaveURL(/\/become-a-gm$/);

  const veteran = await newPage(browser);
  await login(veteran, "gm@questboard.test");
  await veteran.goto("/gm");
  await expect(veteran.getByRole("heading", { name: "Get your table ready" })).toHaveCount(0);
});

test("feedback: anyone can send it from the footer; admins are notified and can mark it done", async ({ page, browser }) => {
  const db = e2eDb();
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Send feedback" }).click();
  await expect(page).toHaveURL(/\/feedback$/);
  await page.getByText("An idea", { exact: true }).click();
  await page.getByLabel("Your message").fill("Too short");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Write 10–2000 characters.")).toBeVisible();
  const text = `Please add a filter for kid-friendly games ${Date.now()}`;
  await page.getByLabel("Your message").fill(text);
  await page.getByLabel(/Your email/).fill("visitor@example.com");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thank you! Your feedback has reached the team.")).toBeVisible();
  const row = db.prepare("SELECT kind, email, user_id, status FROM feedback WHERE body = ?").get(text) as { kind: string; email: string; user_id: number | null; status: string };
  expect(row).toEqual({ kind: "idea", email: "visitor@example.com", user_id: null, status: "new" });

  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  await admin.goto("/notifications");
  await expect(admin.getByText("New feedback from the feedback form").first()).toBeVisible();
  await admin.goto("/admin/feedback");
  const item = admin.getByRole("listitem").filter({ hasText: text });
  await expect(item).toContainText("visitor@example.com");
  await item.getByRole("button", { name: "Mark done" }).click();
  await expect(admin.getByRole("listitem").filter({ hasText: text }).getByRole("button", { name: "Reopen" })).toBeVisible();
  expect((await page.goto("/admin/feedback"))?.status()).toBe(404); // not for visitors
  db.close();
});

test("sign-up records Terms consent; a password change sends a security email", async ({ page }) => {
  const db = e2eDb();
  const email = unique("consent");
  await signup(page, "Careful Player", email);
  const u = db.prepare("SELECT terms_accepted_at, terms_version FROM users WHERE email = ?").get(email) as { terms_accepted_at: string | null; terms_version: string };
  expect(u.terms_accepted_at).toBeTruthy();
  expect(u.terms_version).toMatch(/^\d{4}-\d{2}-\d{2}/);

  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  await page.goto("/settings");
  await page.getByLabel("Current password").fill("tavern-demo-42");
  await page.getByLabel("New password").fill("a-much-better-passphrase");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = ? AND subject LIKE '%password%'").get(mark, email) as { subject: string; body_text: string };
  expect(mail.subject).toBe("Your Quest Board password was changed");
  expect(mail.body_text).toContain("/forgot-password");
  db.close();
});

test("players are warned about recently changed payment details; admins see GMs who change them often", async ({ page, browser }) => {
  test.setTimeout(120_000); // a GM, a player, a booking, two changes, an admin and a report in one journey
  const gmEmail = unique("paywarn");
  const slug = await createGmWithGame(page, "Switchy GM", gmEmail, `Switchy Table ${Date.now() % 100000}`);
  const player = await newPage(browser);
  await signup(player, "Wary Player", unique("wary"));
  await bookFirstOpenSeat(player, [slug]);
  await player.goto(`/games/${slug}`);
  await expect(player.getByText("How to pay the GM")).toBeVisible();
  await expect(player.getByText(/These payment details were changed on/)).toHaveCount(0); // set once, never changed
  // A brand-new GM without reviews: players see why to be a little careful.
  await expect(player.getByText("Joined Quest Board less than 30 days ago and has no reviews yet.")).toBeVisible();

  const change = async (payment: string) => {
    await page.goto("/gm");
    await page.getByRole("link", { name: /Edit profile & payment details/ }).click();
    await page.getByLabel(/How players pay you/).fill(payment);
    await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
    await page.waitForURL("**/gm");
  };
  await change("DANA 0899-1111 a.n. Someone Else");
  await player.reload();
  await expect(player.getByText(/These payment details were changed on .+ confirm them with the GM in the chat before you pay/)).toBeVisible();

  const admin = await newPage(browser);
  await login(admin, "admin@questboard.test");
  const row = () => admin.getByRole("row").filter({ hasText: gmEmail });
  await admin.goto(`/admin/gms?q=${encodeURIComponent(gmEmail)}`);
  await expect(row().getByText(/Payment details changed/)).toHaveCount(0); // once is normal
  await change("OVO 0877-2222 a.n. Another Person");
  await admin.reload();
  await expect(row().getByText("Payment details changed 2 times in 30 days")).toBeVisible();

  // The player can report the details right where they are, with "scam" already chosen.
  await player.reload();
  const reportPayment = player.locator("details", { hasText: "Report these payment details" });
  await reportPayment.getByText("Report these payment details").click();
  await expect(reportPayment.getByLabel("Scam or fake payment details")).toBeChecked();
  await reportPayment.getByRole("button", { name: "Send report" }).click();
  await expect(player.getByText("Thanks — our moderators will take a look.")).toBeVisible();
  await admin.goto("/admin/reports");
  await expect(admin.getByRole("listitem").filter({ hasText: "Payment details: OVO 0877-2222 a.n. Another Person" }).first()).toBeVisible();

  // After the warning window, the note goes away.
  const db = e2eDb();
  db.prepare("UPDATE payment_changes SET changed_at = '2020-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(gmEmail);
  db.close();
  await player.reload();
  await expect(player.getByText("How to pay the GM")).toBeVisible();
  await expect(player.getByText(/These payment details were changed on/)).toHaveCount(0);
});

test("changing a GM's payment details sends a security email showing the new details", async ({ page }) => {
  const db = e2eDb();
  const email = unique("paygm");
  await signup(page, "Careful GM", email, true);
  const fillProfile = async (payment: string) => {
    await page.goto("/gm");
    await page.getByRole("link", { name: /Edit profile & payment details/ }).click();
    await page.getByLabel("Headline").fill("Short one-shots");
    await page.getByLabel("About you").fill("GM yang suka one-shot singkat dan cerita misteri di kota.");
    await page.getByLabel(/How players pay you/).fill(payment);
    await page.getByRole("button", { name: /Save & go to GM dashboard/ }).click();
    await page.waitForURL("**/gm");
  };
  const mark = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM email_outbox").get() as { n: number }).n;
  const mails = () => db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = ? AND subject LIKE '%payment details%'").all(mark, email) as { subject: string; body_text: string }[];
  await fillProfile("BCA 111-222-333 a.n. Careful GM");
  expect(mails()).toHaveLength(0); // first time: nothing changed
  await fillProfile("BCA 111-222-333 a.n. Careful GM"); // saved again, same details
  expect(mails()).toHaveLength(0);
  await fillProfile("Mandiri 999-888 a.n. Someone Else");
  const [mail] = mails();
  expect(mail.subject).toBe("Your Quest Board payment details were changed");
  expect(mail.body_text).toContain("Mandiri 999-888 a.n. Someone Else");
  expect(mail.body_text).toContain("/forgot-password");
  db.close();
});

test("the dev email gallery shows every email in both languages, with every placeholder filled", async ({ page }) => {
  for (const lang of ["en", "id"] as const) {
    await page.goto(`/dev/emails?lang=${lang}`);
    const mails = page.getByTestId("gallery-mail");
    await expect(mails).toHaveCount(23);
    const texts = [...(await page.getByTestId("gallery-subject").allInnerTexts()), ...(await page.getByTestId("gallery-body").allInnerTexts())];
    for (const text of texts) expect(text, `[${lang}] ${text.slice(0, 60)}`).not.toMatch(/\{\w+\}/);
  }
  await expect(page.locator("#verify").getByTestId("gallery-subject")).not.toHaveText(/confirm/i); // Indonesian now
  await page.goto("/dev/emails?lang=id&tz=Asia/Makassar");
  await expect(page.locator("#reminder-24h").getByTestId("gallery-body")).toContainText("20.00 WITA");
});
