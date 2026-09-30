// The setup check: what a real deployment must (not) have.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupChecks, type SetupFacts } from "../../src/lib/setup-check.ts";

const now = Date.parse("2026-10-10T12:00:00Z");
const good: SetupFacts = {
  now,
  legalVersion: "2026-10-01",
  cronLastRun: new Date(now - 4 * 60_000).toISOString(),
  lastBackupAt: new Date(now - 10 * 3_600_000).toISOString(),
  env: {
    NODE_ENV: "production", QUESTBOARD_SEED: "false", RESEND_API_KEY: "re_x", QUESTBOARD_MAIL_FROM: "Quest Board <halo@questboard.id>",
    QUESTBOARD_BASE_URL: "https://questboard.id", QUESTBOARD_ENFORCE_HTTPS: "true", QUESTBOARD_CONTACT_EMAIL: "halo@questboard.id", QUESTBOARD_CRON_SECRET: "s",
  },
};
const level = (f: SetupFacts, id: string) => setupChecks(f).find((c) => c.id === id)!.level;

test("a well-set-up production server passes every check", () => {
  assert.deepEqual(setupChecks(good).filter((c) => c.level !== "ok").map((c) => c.id), []);
});

test("production problems are marked for fixing", () => {
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_DEV_OUTBOX: "true" } }, "test-switches"), "danger");
  const withSwitches = setupChecks({ ...good, env: { ...good.env, QUESTBOARD_INSECURE_COOKIES: "true", QUESTBOARD_RATE_LIMIT: "off" } }).find((c) => c.id === "test-switches")!;
  assert.equal(withSwitches.vars?.names, "QUESTBOARD_INSECURE_COOKIES, QUESTBOARD_RATE_LIMIT");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_SEED: undefined } }, "seed"), "danger"); // demo accounts with a known password
  assert.equal(level({ ...good, env: { ...good.env, RESEND_API_KEY: undefined } }, "email"), "danger");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_BASE_URL: "http://questboard.id" } }, "base-url"), "danger");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_ENFORCE_HTTPS: undefined } }, "https"), "warn");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_CONTACT_EMAIL: undefined } }, "contact"), "warn");
  assert.equal(level({ ...good, cronLastRun: null }, "cron"), "danger");
  assert.equal(level({ ...good, cronLastRun: new Date(now - 45 * 60_000).toISOString() }, "cron"), "danger"); // stopped
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_CRON_SECRET: undefined } }, "cron"), "danger");
  assert.equal(level({ ...good, lastBackupAt: null }, "backup"), "danger");
  assert.equal(level({ ...good, lastBackupAt: new Date(now - 40 * 3_600_000).toISOString() }, "backup"), "danger");
  assert.equal(level({ ...good, legalVersion: "2026-09-29-draft" }, "legal"), "warn");
});

test("a development machine gets reminders, not alarms", () => {
  const dev: SetupFacts = { now, legalVersion: "2026-09-29-draft", cronLastRun: null, lastBackupAt: null, env: { NODE_ENV: "development" } };
  const levels = setupChecks(dev).map((c) => c.level);
  assert.ok(!levels.includes("danger") || setupChecks(dev).filter((c) => c.level === "danger").every((c) => c.id === "cron"), JSON.stringify(setupChecks(dev)));
});
