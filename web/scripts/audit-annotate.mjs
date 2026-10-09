// Turns `npm audit --json` output into one plain line per problem, as CI annotations (public, unlike the
// job log) or console lines locally. Exit code 1 when anything high or critical affects what the site runs on.
//
//   npm audit --omit=dev --json > audit.json; node scripts/audit-annotate.mjs audit.json
import { readFileSync } from "node:fs";
import { annotateError, annotateWarning, stepSummary } from "./ci-annotate.mjs";

const SERIOUS = new Set(["high", "critical"]);

/** One entry per advisory: package, severity, title, link, and what to update to (when known). */
export function auditFindings(report) {
  const out = [];
  for (const [name, v] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via !== "object") continue; // a transitive mention; the advisory itself is listed under its own package
      const fix = v.fixAvailable && typeof v.fixAvailable === "object" ? `${v.fixAvailable.name}@${v.fixAvailable.version}` : v.fixAvailable ? "npm audit fix" : "no fix yet";
      out.push({ name, severity: via.severity, title: via.title, url: via.url, range: via.range, fix });
    }
  }
  return out.sort((a, b) => Number(SERIOUS.has(b.severity)) - Number(SERIOUS.has(a.severity)));
}

if (process.argv[1]?.endsWith("audit-annotate.mjs")) {
  const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const found = auditFindings(report);
  const serious = found.filter((f) => SERIOUS.has(f.severity));
  for (const f of found) {
    const line = `${f.name} ${f.range}: ${f.title} (${f.severity}) — update: ${f.fix} — ${f.url}`;
    (SERIOUS.has(f.severity) ? annotateError : annotateWarning)("Dependency advisory", line);
  }
  stepSummary(found.length
    ? `### Dependency advisories\n\n${found.map((f) => `- **${f.severity}** ${f.name}: ${f.title} → ${f.fix}`).join("\n")}`
    : "### Dependency advisories\n\nNone in what the site runs on.");
  console.log(`${found.length} advisories, ${serious.length} high or critical.`);
  process.exit(serious.length ? 1 : 0);
}
