import { defineConfig } from "@playwright/test";

// E2E tests run against a production build with a throwaway, freshly seeded database.
// Uses the locally installed Microsoft Edge so no browser download is needed
// (set PW_CHANNEL=chrome to use Chrome instead).
const PORT = 3100;
// A second server on an empty database (no demo data), as on launch day: tests/e2e/empty-launch.spec.ts.
const EMPTY_PORT = 3101;
// The seeded specs are split over two identical servers with their own databases: each database fills up
// half as much, so pages stay fast (~16 min instead of ~27). Specs that depend on each other must share a project.
const PORT_2 = 3102;
const SECOND = /\/(a11y|ux-polish|hire-and-browse|share-calendar-live|board-social|gm-tools|taxonomy|notification-email|questions|language-urls|earnings|permissions|two-step)\.spec\.ts$/;
// Chromium projects: the installed Edge locally (no download), Playwright's bundled Chromium on CI.
const CHROMIUM = process.env.PW_CHANNEL || (process.env.CI ? undefined : "msedge");
const SEEDED_ENV = { QUESTBOARD_INSECURE_COOKIES: "true", QUESTBOARD_DEV_OUTBOX: "true", QUESTBOARD_RATE_LIMIT_OVERRIDES: "signup=500,login=40,loginIp=5000,resetIp=500", QUESTBOARD_CRON_SECRET: "e2e-cron-secret" };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  // One project at a time by default: on a laptop, three servers plus three browsers at once starve each
  // other (no faster, and tests time out at random). E2E_WORKERS=3 runs them side by side on a bigger machine.
  workers: Number(process.env.E2E_WORKERS ?? 1),
  retries: 0,
  // Multi-account journeys take ~15 s on an idle machine; 60 s keeps a busy moment from failing
  // them. Individual steps keep their own short timeouts, so a real hang still fails fast.
  timeout: 60_000,
  // Three servers and three browsers share one machine during a full run, so a page can take a few
  // seconds under load. Assertions retry until they pass, so a longer limit doesn't slow passing tests.
  expect: { timeout: 15_000 },
  // On CI, also report each failure as a GitHub annotation: those are public, unlike the raw job log.
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-US",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "seeded", testIgnore: [/empty-launch.spec.ts/, /cross-browser.spec.ts/, SECOND], workers: 1, metadata: { db: "data/e2e.db" }, use: { channel: CHROMIUM } },
    { name: "seeded-2", testMatch: SECOND, workers: 1, metadata: { db: "data/e2e-2.db" }, use: { channel: CHROMIUM, baseURL: `http://localhost:${PORT_2}` } },
    { name: "empty", testMatch: /empty-launch.spec.ts/, workers: 1, metadata: { db: "data/e2e-empty.db" }, use: { channel: CHROMIUM, baseURL: `http://localhost:${EMPTY_PORT}` } },
    // The main journeys again in the other engines (WebKit = Safari, on every iPhone), on the "seeded" server.
    { name: "firefox", testMatch: /cross-browser.spec.ts/, workers: 1, metadata: { db: "data/e2e.db" }, use: { browserName: "firefox" } },
    { name: "webkit", testMatch: /cross-browser.spec.ts/, workers: 1, metadata: { db: "data/e2e.db" }, use: { browserName: "webkit" } },
  ],
  webServer: [{
    command: `node scripts/reset-db.mjs data/e2e.db data/e2e-uploads && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Many specs sign up and log in (as the same demo accounts) from one IP. Limits are raised for
    // sign-up and login; P1-9 still proves the login limiter works at the raised value (E2E_LOGIN_LIMIT).
    env: { QUESTBOARD_DB: "data/e2e.db", QUESTBOARD_UPLOAD_DIR: "data/e2e-uploads", ...SEEDED_ENV },
  }, {
    command: `node scripts/reset-db.mjs data/e2e-2.db data/e2e-2-uploads && npx next start -p ${PORT_2}`,
    url: `http://localhost:${PORT_2}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { QUESTBOARD_DB: "data/e2e-2.db", QUESTBOARD_UPLOAD_DIR: "data/e2e-2-uploads", ...SEEDED_ENV },
  }, {
    command: `node scripts/reset-db.mjs data/e2e-empty.db data/e2e-empty-uploads && npx next start -p ${EMPTY_PORT}`,
    url: `http://localhost:${EMPTY_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { QUESTBOARD_DB: "data/e2e-empty.db", QUESTBOARD_UPLOAD_DIR: "data/e2e-empty-uploads", QUESTBOARD_SEED: "false" },
  }],
});
