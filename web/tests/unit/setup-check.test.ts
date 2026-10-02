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
  offsiteLast: { at: new Date(now - 10 * 3_600_000).toISOString(), ok: true, detail: "questboard-x.db + 3 picture(s)" },
  env: {
    QUESTBOARD_OFFSITE_ENDPOINT: "https://x.r2.cloudflarestorage.com", QUESTBOARD_OFFSITE_BUCKET: "qb", QUESTBOARD_OFFSITE_KEY_ID: "k", QUESTBOARD_OFFSITE_SECRET: "s",
    NODE_ENV: "production", QUESTBOARD_SEED: "false", RESEND_API_KEY: "re_x", BREVO_API_KEY: "xkeysib-x", RESEND_WEBHOOK_SECRET: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", QUESTBOARD_BREVO_WEBHOOK_TOKEN: "Zk3v9QpR7tYw2LmN8xBc4HdJ", QUESTBOARD_MAIL_FROM: "Quest Board <halo@questboard.id>",
    QUESTBOARD_BASE_URL: "https://questboard.id", QUESTBOARD_ENFORCE_HTTPS: "true", QUESTBOARD_CONTACT_EMAIL: "halo@questboard.id", QUESTBOARD_CRON_SECRET: "q7H2mX9vL4pR8sT1wY6zB3nC",
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
  assert.equal(level({ ...good, env: { ...good.env, RESEND_API_KEY: undefined, BREVO_API_KEY: undefined } }, "email"), "danger");
  assert.equal(level({ ...good, env: { ...good.env, RESEND_API_KEY: undefined } }, "email"), "ok"); // Brevo alone is enough…
  assert.equal(level({ ...good, env: { ...good.env, BREVO_API_KEY: undefined } }, "email-backup"), "warn"); // …but one provider has no backup
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_BREVO_URL: "http://fakes:4000" } }, "email"), "warn");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_BREVO_WEBHOOK_TOKEN: undefined } }, "email-events"), "warn"); // Brevo's bounces go unseen
  assert.equal(setupChecks({ ...good, env: { ...good.env, RESEND_WEBHOOK_SECRET: undefined } }).find((c) => c.id === "email-events")!.vars?.providers, "Resend");
  // Emails in the last 24 hours against the two free plans (100 + 300).
  assert.equal(level({ ...good, emailSent24h: { resend: 100, brevo: 150 } }, "email-today"), "ok");
  assert.equal(level({ ...good, emailSent24h: { resend: 100, brevo: 220 } }, "email-today"), "warn");
  assert.deepEqual(setupChecks({ ...good, emailSent24h: { resend: 12 } }).find((c) => c.id === "email-today")!.vars, { used: 12, limit: 400 });
  assert.equal(setupChecks({ ...good, env: { ...good.env, RESEND_DAILY_LIMIT: "0" } }).find((c) => c.id === "email-today"), undefined); // a paid plan without a limit
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_BASE_URL: "http://questboard.id" } }, "base-url"), "danger");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_ENFORCE_HTTPS: undefined } }, "https"), "warn");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_CONTACT_EMAIL: undefined } }, "contact"), "warn");
  assert.equal(level({ ...good, cronLastRun: null }, "cron"), "danger");
  assert.equal(level({ ...good, cronLastRun: new Date(now - 45 * 60_000).toISOString() }, "cron"), "danger"); // stopped
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_CRON_SECRET: undefined } }, "cron"), "danger");
  assert.equal(level({ ...good, lastBackupAt: null }, "backup"), "danger");
  assert.equal(level({ ...good, lastBackupAt: new Date(now - 40 * 3_600_000).toISOString() }, "backup"), "danger");
  assert.equal(level({ ...good, legalVersion: "2026-09-29-draft" }, "legal"), "warn");
  assert.equal(level({ ...good, offsiteLast: { at: good.offsiteLast!.at, ok: false, detail: "PUT: 403" } }, "offsite"), "danger");
  assert.equal(level({ ...good, offsiteLast: { at: new Date(now - 50 * 3_600_000).toISOString(), ok: true, detail: "x" } }, "offsite"), "danger");
  assert.equal(level({ ...good, offsiteLast: null }, "offsite"), "warn"); // configured, not run yet
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_OFFSITE_SECRET: undefined } }, "offsite"), "warn"); // not set up
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_RESEND_URL: "http://fakes:4000" } }, "email"), "warn");
  const GB = 1024 ** 3;
  assert.equal(level({ ...good, diskFreeBytes: 20 * GB }, "disk"), "ok");
  assert.equal(level({ ...good, diskFreeBytes: 2 * GB }, "disk"), "warn");
  assert.equal(level({ ...good, diskFreeBytes: 0.5 * GB }, "disk"), "danger");
  assert.equal(setupChecks({ ...good, diskFreeBytes: 0.5 * GB }).find((c) => c.id === "disk")!.vars?.gb, 0.5);
  assert.equal(setupChecks(good).find((c) => c.id === "disk"), undefined); // unknown: no line
  // Off-site space against the free 10 GB.
  const stored = (bytes: number, keepDays = 60) => ({ ...good, offsiteLast: { ...good.offsiteLast!, bytes, keepDays } });
  assert.equal(level(stored(300 * 1024 ** 2), "offsite-space"), "ok");
  assert.equal(setupChecks(stored(300 * 1024 ** 2)).find((c) => c.id === "offsite-space")!.vars?.size, "300 MB");
  assert.equal(setupChecks(stored(2.5 * GB)).find((c) => c.id === "offsite-space")!.vars?.size, "2.5 GB");
  assert.equal(level(stored(9 * GB), "offsite-space"), "warn");
  assert.equal(setupChecks(stored(1024, 0)).find((c) => c.id === "offsite-space")!.detail, "setup.offsiteSpaceKeepAll");
  assert.equal(setupChecks(good).find((c) => c.id === "offsite-space"), undefined); // not measured yet
  assert.equal(level({ ...good, prelaunch: { on: true, waiting: 12 } }, "prelaunch"), "warn"); // players can't book yet
  // Secrets: short, the example, or not Resend's format.
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_CRON_SECRET: "change-me-to-a-long-random-string" } }, "secrets"), "danger");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_BREVO_WEBHOOK_TOKEN: "short" } }, "secrets"), "danger");
  assert.equal(level({ ...good, env: { ...good.env, QUESTBOARD_CRON_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa" } }, "secrets"), "danger");
  assert.equal(setupChecks({ ...good, env: { ...good.env, RESEND_WEBHOOK_SECRET: "my-secret" } }).find((c) => c.id === "secrets")!.vars?.names, "RESEND_WEBHOOK_SECRET");
  assert.equal(setupChecks({ ...good, prelaunch: { on: false, waiting: 0 } }).find((c) => c.id === "prelaunch"), undefined);
});

test("a development machine gets reminders, not alarms", () => {
  const dev: SetupFacts = { now, legalVersion: "2026-09-29-draft", cronLastRun: null, lastBackupAt: null, env: { NODE_ENV: "development" } };
  const levels = setupChecks(dev).map((c) => c.level);
  assert.ok(!levels.includes("danger") || setupChecks(dev).filter((c) => c.level === "danger").every((c) => c.id === "cron"), JSON.stringify(setupChecks(dev)));
});
