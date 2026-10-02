import { defineConfig } from "@playwright/test";

// The production rehearsal (npm run rehearsal, needs Docker): tests/rehearsal against the deployment kit
// running on https://localhost:8443 (scripts/rehearsal.mjs starts and removes it). Not part of test:e2e.
export default defineConfig({
  testDir: "./tests/rehearsal",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // On CI, failures also become GitHub annotations: those are public, unlike the raw job log.
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "https://localhost:8443",
    ignoreHTTPSErrors: true, // Caddy's local certificate
    channel: process.env.CI ? undefined : "msedge",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
});
