import { defineConfig } from "@playwright/test";

// The production rehearsal (npm run rehearsal, needs Docker): tests/rehearsal against the deployment kit
// running on https://localhost:8443 (scripts/rehearsal.mjs starts and removes it). Not part of test:e2e.
export default defineConfig({
  testDir: "./tests/rehearsal",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "https://localhost:8443",
    ignoreHTTPSErrors: true, // Caddy's local certificate
    channel: process.env.CI ? undefined : "msedge",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
});
