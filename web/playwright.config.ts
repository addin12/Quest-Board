import { defineConfig } from "@playwright/test";

// E2E tests run against a production build with a throwaway, freshly seeded database.
// Uses the locally installed Microsoft Edge so no browser download is needed
// (set PW_CHANNEL=chrome to use Chrome instead).
const PORT = 3100;
// A second server on an empty database (no demo data), as on launch day: tests/e2e/empty-launch.spec.ts.
const EMPTY_PORT = 3101;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Local: installed Edge (no download). CI: Playwright's bundled Chromium.
    channel: process.env.PW_CHANNEL || (process.env.CI ? undefined : "msedge"),
    locale: "en-US",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "seeded", testIgnore: /empty-launch.spec.ts/ },
    { name: "empty", testMatch: /empty-launch.spec.ts/, use: { baseURL: `http://localhost:${EMPTY_PORT}` } },
  ],
  webServer: [{
    command: `node scripts/reset-db.mjs data/e2e.db && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Many specs sign up and log in (as the same demo accounts) from one IP. Limits are raised for
    // sign-up and login; P1-9 still proves the login limiter works at the raised value (E2E_LOGIN_LIMIT).
    env: { QUESTBOARD_DB: "data/e2e.db", QUESTBOARD_DEV_OUTBOX: "true", QUESTBOARD_RATE_LIMIT_OVERRIDES: "signup=500,login=40", QUESTBOARD_CRON_SECRET: "e2e-cron-secret" },
  }, {
    command: `node scripts/reset-db.mjs data/e2e-empty.db && npx next start -p ${EMPTY_PORT}`,
    url: `http://localhost:${EMPTY_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { QUESTBOARD_DB: "data/e2e-empty.db", QUESTBOARD_SEED: "false" },
  }],
});
