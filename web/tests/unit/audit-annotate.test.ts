// The daily security watch (scripts/audit-annotate.mjs): npm audit's report becomes one plain line per
// advisory, serious ones first, with what to update to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditFindings } from "../../scripts/audit-annotate.mjs";

test("advisories are listed one by one, high/critical first, with the fix", () => {
  const report = {
    vulnerabilities: {
      next: {
        fixAvailable: { name: "next", version: "16.3.8" },
        via: [
          { severity: "moderate", title: "Cache poisoning in SSG/ISR", url: "https://github.com/advisories/GHSA-mcj8", range: ">=16.0.0 <16.3.8" },
          { severity: "high", title: "Server-Side Request Forgery in Image Optimization", url: "https://github.com/advisories/GHSA-cjq9", range: ">=16.0.0 <16.3.8" },
        ],
      },
      postcss: { fixAvailable: true, via: ["source-map-js"] }, // a transitive mention: not repeated
      "source-map-js": { fixAvailable: false, via: [{ severity: "low", title: "Event-loop DoS", url: "https://x", range: "<1.2.2" }] },
    },
  };
  const found = auditFindings(report);
  assert.equal(found.length, 3);
  assert.equal(found[0].severity, "high");
  assert.equal(found[0].fix, "next@16.3.8");
  assert.equal(found.find((f) => f.name === "source-map-js")!.fix, "no fix yet");
  assert.deepEqual(auditFindings({}), []);
});
