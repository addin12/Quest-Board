// docs/api-reference.md is generated from the route files (CLAUDE.md, Documentation). If this fails, an API
// route changed or lacks its comment: add the comment above its first export, run `npm run docs:api`, commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildApiDocs, routeComment, routeMethods } from "../../scripts/build-api-docs.mjs";

test("the API reference is up to date with the routes, and every route says what it does", () => {
  const docs = buildApiDocs();
  assert.equal(readFileSync(new URL("../../../docs/api-reference.md", import.meta.url), "utf8"), docs, "run `npm run docs:api`");
  assert.ok(!docs.includes("(no description"), "a route has no comment above its first export");
  assert.match(docs, /## `POST \/api\/vitals`/);
  assert.match(docs, /## `GET \/api\/calendar\/\{feed\}`/);
});

test("a route's comment and methods are read from its source", () => {
  const src = `import x from "y";\n\n/**\n * GET /api/thing — the thing.\n * Second line.\n */\nexport async function GET() {}\nexport const POST = GET;\n`;
  assert.equal(routeComment(src), "GET /api/thing — the thing.\nSecond line.");
  assert.deepEqual(routeMethods(src), ["GET", "POST"]);
  assert.equal(routeComment(`// One line.\nexport const dynamic = "force-dynamic";\nexport function GET() {}`), "One line.");
});
