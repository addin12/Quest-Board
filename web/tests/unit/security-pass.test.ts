// Round 31 security pass: secrets never reach the logs, and public endpoints don't buffer huge bodies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { redactPath, shapeError } from "../../src/lib/error-shape.ts";
import { readTextLimited } from "../../src/lib/read-body.ts";

test("logged paths keep no secrets: query strings, invite tokens, calendar feed tokens", () => {
  assert.equal(redactPath("/reset-password?token=abc"), "/reset-password");
  assert.equal(redactPath("/invite/0123456789abcdef"), "/invite/…");
  assert.equal(redactPath("/api/calendar/SeCrEt-ToKeN.ics"), "/api/calendar/…");
  assert.equal(redactPath("/api/email-events/brevo?token=hunter2"), "/api/email-events/brevo");
  assert.equal(redactPath("/games/naga"), "/games/naga");
  assert.equal(shapeError(new Error("x"), { path: "/invite/abc?next=1", method: "GET" }, {}).path, "/invite/…");
});

test("a body over the limit is refused without being read whole", async () => {
  const small = new Request("http://x/", { method: "POST", body: "hello" });
  assert.equal(await readTextLimited(small, 10), "hello");
  const declared = new Request("http://x/", { method: "POST", body: "x".repeat(50), headers: { "content-length": "50" } });
  assert.equal(await readTextLimited(declared, 10), null);
  // No length given (streamed): stops as soon as it's over.
  let pulled = 0;
  const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); if (pulled > 1000) c.close(); } });
  const streamed = new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  assert.equal(await readTextLimited(streamed, 4096), null);
  assert.ok(pulled < 20, `read ${pulled} KB before stopping`);
});
