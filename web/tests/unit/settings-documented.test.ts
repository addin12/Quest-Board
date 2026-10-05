// Every setting the app, its scripts or the deployment kit reads is listed in deploy/.env.example — the one
// place a server's owner looks. (Before this test, docs and code drifted apart for several rounds.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Set by Node, Next.js or the test tools — not something an owner configures. */
const NOT_SETTINGS = new Set(["NODE_ENV", "NEXT_RUNTIME", "PORT", "CI", "GITHUB_ACTIONS", "GITHUB_STEP_SUMMARY", "NEXT_TELEMETRY_DISABLED", "TZ", "PW_CHANNEL", "E2E_WORKERS"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

test("every setting the code reads is in deploy/.env.example", () => {
  const read = new Set<string>();
  for (const f of [...files("src"), ...files("scripts")]) {
    // process.env.X, env.X, and the setup check's e.X
    for (const m of readFileSync(f, "utf8").matchAll(/\b(?:process\.env|env|e)\.([A-Z][A-Z0-9_]{2,})\b/g)) read.add(m[1]);
  }
  // ${X} / ${X:-default} in the compose file
  for (const m of readFileSync("../deploy/docker-compose.yml", "utf8").matchAll(/\$\{([A-Z][A-Z0-9_]+)/g)) read.add(m[1]);
  const example = readFileSync("../deploy/.env.example", "utf8");
  const missing = [...read].filter((name) => !NOT_SETTINGS.has(name) && !new RegExp(`\\b${name}\\b`).test(example)).sort();
  assert.deepEqual(missing, [], `add these to deploy/.env.example (or to NOT_SETTINGS if no owner ever sets them): ${missing.join(", ")}`);
  assert.ok(read.size > 30, "the scan found the settings"); // guards the scan itself
});
