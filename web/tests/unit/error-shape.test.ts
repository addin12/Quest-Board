import { test } from "node:test";
import assert from "node:assert/strict";
import { isControlFlow, shapeError } from "../../src/lib/error-shape.ts";

test("error log rows never keep the query string (it can hold reset or session tokens)", () => {
  const row = shapeError(new TypeError("boom"), { path: "/reset-password?token=SECRET", method: "POST" }, { routePath: "/reset-password", routeType: "action" });
  assert.deepEqual(row, { message: "TypeError: boom", digest: "", method: "POST", path: "/reset-password", route_path: "/reset-password", route_type: "action" });
  assert.equal(shapeError("x".repeat(5000), {}, {}).message.length, 1000);
  const withDigest = Object.assign(new Error("hidden"), { digest: "12345" });
  assert.equal(shapeError(withDigest, {}, {}).digest, "12345");
});

test("redirect() and notFound() are control flow, not errors", () => {
  assert.equal(isControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })), true);
  assert.equal(isControlFlow(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })), true);
  assert.equal(isControlFlow(new Error("real failure")), false);
  assert.equal(isControlFlow("nope"), false);
});
