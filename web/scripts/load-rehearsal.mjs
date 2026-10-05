// npm run load-rehearsal: a busy evening on the smallest setup (needs Docker). Starts the deployment kit
// like the production rehearsal (memory caps, HTTPS through Caddy) with demo data, runs the load test
// (scripts/load-test.mjs) against it while sampling the containers' memory, then checks: no errors, no
// overbooked session, memory under the caps, nothing killed for memory. Removes everything afterwards.
//
//   npm run load-rehearsal -- [--users 100] [--seconds 120] [--keep]
//
// 100 virtual users clicking without pause is far busier than 100 people (who read between clicks):
// roughly a 1,000-member community on its busiest evening, with room to spare.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { annotateError, annotateNotice, annotateWarning, stepSummary } from "./ci-annotate.mjs";
import { baselineKey, compareToBaseline, summaryLine } from "./load-trend.mjs";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const USERS = Number(arg("users", 100));
const SECONDS = Number(arg("seconds", 120));
const keep = process.argv.includes("--keep");
const CAPS = { app: 768, scheduler: 384 }; // MiB: deploy/docker-compose.yml mem_limit

const DEPLOY = resolve(import.meta.dirname, "../../deploy");
const env = { ...process.env, QUESTBOARD_ENV_FILE: "rehearsal/rehearsal.env" };
const files = ["-p", "qb-load", "-f", "docker-compose.yml", "-f", "rehearsal/docker-compose.rehearsal.yml", "-f", "rehearsal/docker-compose.load.yml"];
const compose = (args, opts = {}) => execFileSync("docker", ["compose", ...files, ...args], { cwd: DEPLOY, env, encoding: "utf8", ...opts });

const MiB = (s) => {
  const m = /([\d.]+)\s*([KMG]i?B)/.exec(s);
  return m ? Number(m[1]) * ({ KiB: 1 / 1024, KB: 1 / 1024, MiB: 1, MB: 1, GiB: 1024, GB: 1024 }[m[2]] ?? NaN) : NaN;
};
const memoryNow = (id) => MiB(execFileSync("docker", ["stats", "--no-stream", "--format", "{{.MemUsage}}", id], { encoding: "utf8" }).split("/")[0]);

let code = 1;
try {
  compose(["down", "-v", "--remove-orphans"], { stdio: "inherit" });
  compose(["up", "-d", "--build"], { stdio: "inherit" });
  const until = Date.now() + 180_000;
  for (;;) {
    try {
      execFileSync("curl", ["-ksf", "https://localhost:8443/api/health"], { stdio: "ignore" });
      break;
    } catch {
      if (Date.now() > until) throw new Error("the load stack didn't come up in 3 minutes (docker compose -p qb-load logs)");
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  const ids = { app: compose(["ps", "-q", "app"]).trim(), scheduler: compose(["ps", "-q", "scheduler"]).trim() };
  const peak = { app: 0, scheduler: 0 };
  const sample = () => { for (const s of ["app", "scheduler"]) peak[s] = Math.max(peak[s], memoryNow(ids[s]) || 0); };
  sample();
  const sampler = setInterval(() => { try { sample(); } catch { /* a sample can fail while busy */ } }, 3_000);

  // The load test itself (Caddy's local certificate isn't trusted by Node: this one process skips the check).
  const numbers = join(mkdtempSync(join(tmpdir(), "qb-load-")), "result.json");
  const load = spawn(process.execPath, ["scripts/load-test.mjs", "--base", "https://localhost:8443", "--users", String(USERS), "--seconds", String(SECONDS), "--json", numbers], {
    cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0", NODE_NO_WARNINGS: "1" }, stdio: "inherit",
  });
  const loadCode = await new Promise((ok) => load.on("exit", (c) => ok(c ?? 1)));
  clearInterval(sampler);
  sample();

  const over = compose(["exec", "-T", "app", "node", "-e", `const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("/data/questboard.db",{readOnly:true});
console.log(JSON.stringify(d.prepare("SELECT s.id, g.seats_total, COUNT(b.id) AS booked FROM game_sessions s JOIN games g ON g.id = s.game_id JOIN bookings b ON b.session_id = s.id AND b.status = 'confirmed' GROUP BY s.id HAVING booked > g.seats_total").all()))`]).trim();
  const oom = Object.entries(ids).filter(([, id]) => execFileSync("docker", ["inspect", "-f", "{{.State.OOMKilled}}", id], { encoding: "utf8" }).trim() !== "false").map(([s]) => s);

  console.log(`\n[load] peak memory: app ${peak.app.toFixed(0)} of ${CAPS.app} MiB, scheduler ${peak.scheduler.toFixed(0)} of ${CAPS.scheduler} MiB`);
  console.log(`[load] overbooked sessions: ${over}`);

  // The trend: this run against the last good one (scripts/load-baseline.json). A warning, not a failure.
  if (existsSync(numbers)) {
    const result = JSON.parse(readFileSync(numbers, "utf8"));
    const key = baselineKey();
    const baseline = JSON.parse(readFileSync(resolve(import.meta.dirname, "load-baseline.json"), "utf8"))[key];
    const line = summaryLine(result);
    annotateNotice("Load rehearsal", `${line}; app peak ${peak.app.toFixed(0)} MiB`);
    const slower = compareToBaseline(result, baseline);
    for (const w of slower) annotateWarning("Load rehearsal slower than usual", `${w} — baseline (${key}): ${baseline.measured}`);
    stepSummary([
      "### Load rehearsal",
      `${line}; app peak ${peak.app.toFixed(0)} of ${CAPS.app} MiB.`,
      baseline ? `Baseline (${key}, ${baseline.measured}): ${baseline.rps} requests a second, pages p95 ${baseline.pageP95} ms.` : "No baseline yet.",
      ...(slower.length ? [`**Slower than usual:** ${slower.join("; ")}.`] : []),
    ].join("\n\n"));
  }
  const problems = [
    loadCode !== 0 && "the load test had errors (above)",
    over !== "[]" && "a session was overbooked",
    oom.length > 0 && `killed for memory: ${oom.join(", ")}`,
    peak.app > CAPS.app * 0.9 && "the app came within 10% of its memory cap",
    peak.scheduler > CAPS.scheduler * 0.9 && "the scheduler came within 10% of its memory cap",
  ].filter(Boolean);
  for (const p of problems) console.log(`[load] ! ${p}`);
  if (problems.length) annotateError("Load rehearsal", problems.join("; "));
  if (!problems.length) console.log("[load] OK: no errors, no overbooking, memory well under the caps.");
  code = problems.length ? 1 : 0;
  if (code) compose(["logs", "--tail", "60", "app"], { stdio: "inherit" });
} catch (err) {
  annotateError("Load rehearsal", err instanceof Error ? err.message : String(err));
  code = 1;
} finally {
  if (!keep) compose(["down", "-v", "--remove-orphans"], { stdio: "inherit" });
}
process.exit(code);
