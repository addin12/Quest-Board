import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFrom, isSafeNext } from "../../src/lib/policy.ts";

test("client IP ignores the spoofable left of X-Forwarded-For", () => {
  // A visitor sends a fake header; our one proxy appends the real address.
  assert.equal(clientIpFrom("6.6.6.6, 203.0.113.9", null), "203.0.113.9");
  assert.equal(clientIpFrom("203.0.113.9", null), "203.0.113.9");
  // Two trusted hops (e.g. CDN + nginx): the client is second from the right.
  assert.equal(clientIpFrom("6.6.6.6, 203.0.113.9, 10.0.0.2", null, 2), "203.0.113.9");
  assert.equal(clientIpFrom("203.0.113.9", null, 3), "203.0.113.9"); // shorter than the hop count
  assert.equal(clientIpFrom(null, "198.51.100.4"), "198.51.100.4");
  assert.equal(clientIpFrom(null, null), "local");
  assert.equal(clientIpFrom("1.1.1.1", null, Number("nonsense")), "1.1.1.1");
});

test("post-login redirects stay on this site", () => {
  for (const ok of ["/dashboard", "/games/naga?x=1", "/id/board", "/"]) assert.equal(isSafeNext(ok), true, ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/ok\nSet-Cookie:x", "/a\\b", "", null, 42, "/" + "a".repeat(600)]) {
    assert.equal(isSafeNext(bad), false, String(bad));
  }
});
