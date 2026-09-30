// npm run rehearsal: a production rehearsal on this machine (needs Docker). Builds and starts the
// deployment kit (deploy/: app, scheduler, Caddy) on https://localhost:8443 with a fresh volume, runs
// tests/rehearsal, then removes everything again. --keep leaves it running to look around.
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const DEPLOY = resolve(import.meta.dirname, "../../deploy");
const env = { ...process.env, QUESTBOARD_ENV_FILE: "rehearsal/rehearsal.env" };
const compose = (...args) =>
  execFileSync("docker", ["compose", "-p", "qb-rehearsal", "-f", "docker-compose.yml", "-f", "rehearsal/docker-compose.rehearsal.yml", ...args], { cwd: DEPLOY, env, stdio: "inherit" });

const keep = process.argv.includes("--keep");
let code = 1;
try {
  compose("down", "-v", "--remove-orphans"); // start from nothing, like a new server
  compose("up", "-d", "--build");
  // Wait until Caddy serves the app over HTTPS.
  const until = Date.now() + 180_000;
  for (;;) {
    try {
      const res = await fetch("https://localhost:8443/api/health");
      if (res.ok) break;
    } catch {
      // not up yet (or Caddy's certificate isn't trusted by Node: fall back below)
    }
    const probe = spawnSync("curl", ["-ksf", "https://localhost:8443/api/health"], { encoding: "utf8" });
    if (probe.status === 0) break;
    if (Date.now() > until) throw new Error("the rehearsal stack didn't come up in 3 minutes (docker compose logs)");
    await new Promise((r) => setTimeout(r, 3_000));
  }
  const run = spawnSync("npx", ["playwright", "test", "--config", "playwright.rehearsal.config.ts"], { cwd: resolve(import.meta.dirname, ".."), stdio: "inherit", shell: true });
  code = run.status ?? 1;
  if (code !== 0) compose("logs", "--tail", "80", "app", "scheduler");
} finally {
  if (!keep) compose("down", "-v", "--remove-orphans");
  else console.log("Left running: https://localhost:8443 (npm run rehearsal again, or docker compose -p qb-rehearsal down -v, to remove it)");
}
process.exit(code);
