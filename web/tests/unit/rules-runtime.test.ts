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
