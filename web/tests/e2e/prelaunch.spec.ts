import { test, expect } from "@playwright/test";
import { login, newPage, signup, unique, e2eDb } from "./helpers";

test("new GMs get a getting-started checklist; set-up GMs don't", async ({ page, browser }) => {
  await signup(page, "Fresh Game Master", unique("fresh-gm"), true);
  await page.goto("/gm");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Get your table ready" }) });
  await expect(card.getByText("0 of 6 done")).toBeVisible();
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
  await page.getByLabel("Current password").fill("password123");
  await page.getByLabel("New password").fill("a-much-better-passphrase");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  const mail = db.prepare("SELECT subject, body_text FROM email_outbox WHERE id > ? AND to_address = ? AND subject LIKE '%password%'").get(mark, email) as { subject: string; body_text: string };
  expect(mail.subject).toBe("Your Quest Board password was changed");
  expect(mail.body_text).toContain("/forgot-password");
  db.close();
});
