// The runtime pieces behind CLAUDE.md's rules: the security log is append-only, a calendar link is checked
// in constant time against its account, secrets compare safely, the breaker and the vitals parser behave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-rules-")), "test.db");
process.env.QUESTBOARD_SEED = "false";

const { db } = await import("../../src/lib/db.ts");
const { logSecurityEvent, recentSecurityEvents, pruneSecurityEvents } = await import("../../src/lib/security-log.ts");
const { calendarFeedOwner, calendarFeedPath } = await import("../../src/lib/queries.ts");
const { sameSecret } = await import("../../src/lib/secret-compare.ts");
const { makeBreaker } = await import("../../src/lib/circuit-breaker.ts");
const { parseVital, p75, vitalsPage, vitalRating } = await import("../../src/lib/vitals.ts");
const { recordVital, vitalsSummary } = await import("../../src/lib/vitals-store.ts");

const user = (email: string) => Number(db().prepare("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', ?)").run(email, email.split("@")[0]).lastInsertRowid);

test("the security log can be added to, but not changed, and not emptied before 180 days", () => {
  const uid = user("sec@x.test");
  logSecurityEvent("login_failed", uid, "wrong password");
  logSecurityEvent("login_failed", null, "unknown account");
  const [newest, older] = recentSecurityEvents(2);
  assert.equal(newest.user_id, null);
  assert.equal(older.name, "sec");
  assert.throws(() => db().prepare("UPDATE security_events SET detail = 'edited'").run(), /append-only/);
  assert.throws(() => db().prepare("DELETE FROM security_events").run(), /kept for 180 days/);
  const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
  db().prepare("INSERT INTO security_events (kind, user_id, created_at) VALUES ('password_changed', ?, ?)").run(uid, old);
  assert.equal(pruneSecurityEvents(), 1); // only the 200-day-old one
  assert.equal(recentSecurityEvents(10).length, 2);
});

test("a calendar link opens only its own account's feed, compared in constant time", () => {
  const a = user("cal-a@x.test");
  const b = user("cal-b@x.test");
  const secret = "S3cretS3cretS3cretS3cretS3cret";
  db().prepare("UPDATE users SET calendar_token = ? WHERE id = ?").run(secret, a);
  assert.equal(calendarFeedPath(a, secret), `/api/calendar/${a}.${secret}.ics`);
  assert.equal(calendarFeedOwner(`${a}.${secret}`)?.id, a);
  assert.equal(calendarFeedOwner(`${b}.${secret}`), undefined); // the right secret with another account
  assert.equal(calendarFeedOwner(`${a}.${secret}x`), undefined);
  assert.equal(calendarFeedOwner(secret), undefined); // the old format, without the account
  assert.equal(calendarFeedOwner(`${a}.short`), undefined);
});

test("sameSecret: equal only for the same text, whatever the lengths", () => {
  assert.equal(sameSecret("abc", "abc"), true);
  assert.equal(sameSecret("abc", "abd"), false);
  assert.equal(sameSecret("abc", "abcd"), false);
  assert.equal(sameSecret("", ""), true);
});

test("circuit breaker: 3 failures in a row open it for the cool-down; one failed retry opens it again", () => {
  let now = 0;
  const b = makeBreaker({ failures: 3, coolMs: 1000, now: () => now });
  b.failure("resend");
  b.failure("resend");
  assert.equal(b.allows("resend"), true);
  b.failure("resend");
  assert.equal(b.allows("resend"), false);
  assert.equal(b.allows("brevo"), true); // per provider
  now = 1000;
  assert.equal(b.allows("resend"), true); // one try after the cool-down
  b.failure("resend");
  assert.equal(b.allows("resend"), false); // …failed: open again at once
  now = 2000;
  b.success("resend");
  b.failure("resend");
  assert.equal(b.allows("resend"), true); // a success resets the count
});

test("web vitals: only our pages, by route pattern; values checked; 75th percentile", () => {
  assert.equal(vitalsPage("/id/games/kopi-naga?ref=wa"), "/games/[slug]");
  assert.equal(vitalsPage("/"), "/");
  assert.equal(vitalsPage("/en"), "/");
  assert.equal(vitalsPage("/gm/games/12"), "/gm/games/[id]");
  assert.equal(vitalsPage("/wp-admin/login.php"), null);
  assert.deepEqual(parseVital({ path: "/games/x", name: "LCP", value: 1234.6 }), { page: "/games/[slug]", metric: "LCP", value: 1235 });
  assert.deepEqual(parseVital({ path: "/", name: "CLS", value: 0.12345 }), { page: "/", metric: "CLS", value: 0.123 });
  for (const bad of [null, "x", { path: "/", name: "FID", value: 1 }, { path: "/", name: "LCP", value: -1 }, { path: "/", name: "LCP", value: 1e9 }, { path: "/nope", name: "LCP", value: 1 }]) {
    assert.equal(parseVital(bad), null, JSON.stringify(bad));
  }
  assert.equal(p75([100, 200, 300, 400]), 300);
  assert.equal(p75([5]), 5);
  assert.equal(p75([]), 0);
  assert.deepEqual([vitalRating("LCP", 2000), vitalRating("LCP", 3000), vitalRating("INP", 600)], ["good", "needs-improvement", "poor"]);

  for (const v of [1000, 2000, 3000, 4000]) recordVital({ page: "/games/[slug]", metric: "LCP", value: v });
  recordVital({ page: "/games/[slug]", metric: "CLS", value: 0.05 });
  recordVital({ page: "/", metric: "LCP", value: 900 });
  const [busiest, home] = vitalsSummary(7);
  assert.deepEqual(busiest, { page: "/games/[slug]", samples: 4, LCP: 3000, CLS: 0.05 });
  assert.equal(home.page, "/");
});

test("round 39: a password-guessing script can't flood the security log; the owner is warned once a day", async () => {
  const { recentAttempts, failedLoginWarning, WARN_AFTER } = await import("../../src/lib/security-log.ts");
  const uid = user("guessed@x.test");
  const at = new Date("2025-01-15T13:20:00Z"); // a fixed hour no other test writes to
  for (let i = 0; i < 120; i++) logSecurityEvent("login_failed", uid, "wrong password", at);
  for (let i = 0; i < 300; i++) logSecurityEvent("login_failed", null, "unknown account", at);
  const rows = db().prepare("SELECT user_id FROM security_events WHERE kind = 'login_failed' AND created_at = ?").all(at.toISOString()) as { user_id: number | null }[];
  assert.equal(rows.length, 2, "one row per account per hour, one for all unknown emails");
  assert.equal(recentAttempts("login_failed", uid, at), 120);
  const shown = recentSecurityEvents(200, uid).find((e) => e.kind === "login_failed" && e.created_at === at.toISOString());
  assert.equal(shown?.times, 120);
  assert.deepEqual(recentSecurityEvents(200, uid).map((e) => e.user_id).filter((u) => u !== uid), [], "one person's history only");

  const fresh = user("warned@x.test");
  for (let i = 1; i < WARN_AFTER.password; i++) logSecurityEvent("login_failed", fresh, "wrong password", at);
  assert.equal(failedLoginWarning(fresh, at), null);
  logSecurityEvent("login_failed", fresh, "wrong password", at);
  assert.deepEqual(failedLoginWarning(fresh, at), { reason: "password", attempts: WARN_AFTER.password });
  logSecurityEvent("login_warning_sent", fresh, "password", at);
  assert.equal(failedLoginWarning(fresh, new Date(at.getTime() + 600_000)), null, "at most one email a day");

  const known = user("code@x.test");
  for (let i = 0; i < WARN_AFTER.code; i++) logSecurityEvent("two_step_failed", known, "", at);
  assert.equal(failedLoginWarning(known, at)?.reason, "code"); // they have the password: warned sooner
});

test("round 39: page-speed caps per page and per day; the 75th percentile is worked out in SQL like p75()", async () => {
  const { VITALS_PER_PAGE_PER_DAY } = await import("../../src/lib/vitals-store.ts");
  const day = Date.parse("2026-10-09T08:00:00Z");
  let kept = 0;
  for (let i = 0; i < VITALS_PER_PAGE_PER_DAY + 50; i++) if (recordVital({ page: "/quiz", metric: "LCP", value: 100 + i }, day)) kept++;
  assert.equal(kept, VITALS_PER_PAGE_PER_DAY);
  assert.equal(recordVital({ page: "/terms", metric: "LCP", value: 1 }, day), true, "another page still has room");
  assert.equal(recordVital({ page: "/quiz", metric: "LCP", value: 1 }, day + 86_400_000), true, "a new day starts again");

  const values = [7, 3, 9, 1, 5, 8, 2];
  for (const v of values) recordVital({ page: "/feedback", metric: "INP", value: v }, day);
  const row = vitalsSummary(7, day + 1000).find((r) => r.page === "/feedback");
  assert.equal(row?.INP, p75(values));
});

test("round 39: an old-form calendar link gets one event pointing at Settings, in both languages", async () => {
  const { linkChangedEvent, buildIcsFeed } = await import("../../src/lib/calendar.ts");
  const { makeT } = await import("../../src/lib/i18n/dict.ts");
  const e = linkChangedEvent("https://qb.test", makeT("en"), makeT("id"), new Date("2026-10-09T13:20:00Z"));
  assert.equal(e.start.toISOString(), "2026-10-09T14:00:00.000Z");
  assert.match(e.title, /calendar link changed .* tautan kalendermu berubah/);
  assert.match(e.description, /https:\/\/qb\.test\/settings/);
  assert.match(buildIcsFeed([e], "Quest Board"), /UID:calendar-link-changed@questboard/);
});
