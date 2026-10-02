// Reports of what the Content Security Policy blocked: what becomes an error-log line, and what's noise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCspReport } from "../../src/lib/csp-report.ts";
import { contentSecurityPolicy } from "../../src/lib/csp.ts";

const ORIGIN = "https://questboard.id";

test("the policy asks browsers to report what it blocks", () => {
  assert.match(contentSecurityPolicy("abc"), /report-uri \/api\/csp-report/);
  assert.match(contentSecurityPolicy(), /report-uri \/api\/csp-report/);
});

test("a report about one of our pages becomes one line, without query strings", () => {
  const classic = { "csp-report": { "document-uri": `${ORIGIN}/games/x?token=secret`, "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?y=1" } };
  assert.deepEqual(parseCspReport(classic, ORIGIN), [{ directive: "script-src-elem", blocked: "https://evil.example", path: "/games/x" }]);
  const modern = [{ type: "csp-violation", body: { documentURL: `${ORIGIN}/settings`, effectiveDirective: "script-src", blockedURL: "inline" } }];
  assert.deepEqual(parseCspReport(modern, ORIGIN), [{ directive: "script-src", blocked: "inline", path: "/settings" }]);
  const own = { "csp-report": { "document-uri": `${ORIGIN}/`, "violated-directive": "img-src 'self'", "blocked-uri": `${ORIGIN}/uploads/a.webp?v=2` } };
  assert.deepEqual(parseCspReport(own, ORIGIN), [{ directive: "img-src", blocked: "/uploads/a.webp", path: "/" }]);
});

test("noise is dropped: extensions, other sites' pages, nonsense", () => {
  assert.deepEqual(parseCspReport({ "csp-report": { "document-uri": `${ORIGIN}/`, "effective-directive": "script-src", "blocked-uri": "chrome-extension://abc/inject.js" } }, ORIGIN), []);
  assert.deepEqual(parseCspReport({ "csp-report": { "document-uri": `${ORIGIN}/`, "effective-directive": "script-src", "blocked-uri": "inline", "source-file": "moz-extension://x/c.js" } }, ORIGIN), []);
  assert.deepEqual(parseCspReport({ "csp-report": { "document-uri": "https://other.example/", "effective-directive": "script-src", "blocked-uri": "inline" } }, ORIGIN), []);
  assert.deepEqual(parseCspReport({ hello: "world" }, ORIGIN), []);
  assert.deepEqual(parseCspReport(null, ORIGIN), []);
});
