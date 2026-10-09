// Share pictures are drawn once and kept until what they show changes (lib/og-cache.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOgCache } from "../../src/lib/og-cache.ts";

const png = (n: number, fill = 1) => () => new Response(new Uint8Array(n).fill(fill));

test("the same card is drawn once; a changed title, price or cover draws a new one", async () => {
  const cache = makeOgCache(1024 * 1024);
  let drawn = 0;
  const card = (title: string, cover: string) => cache({ title, cover }, () => { drawn++; return png(100)(); });
  const first = await card("Kopi & Naga", "/uploads/a.webp");
  await card("Kopi & Naga", "/uploads/a.webp");
  assert.equal(drawn, 1);
  assert.equal(first.headers.get("Content-Type"), "image/png");
  assert.match(first.headers.get("Cache-Control") ?? "", /max-age=600/);
  assert.equal((await first.arrayBuffer()).byteLength, 100);
  await card("Kopi & Naga (new title)", "/uploads/a.webp");
  await card("Kopi & Naga", "/uploads/b.webp");
  assert.equal(drawn, 3);
  assert.notEqual(first.headers.get("ETag"), (await card("Kopi & Naga", "/uploads/b.webp")).headers.get("ETag"));
});

test("each answer can be read on its own (the cached bytes are never handed out twice)", async () => {
  const cache = makeOgCache(1024);
  const a = await cache("k", png(10, 7));
  const b = await cache("k", png(10, 9));
  assert.deepEqual([...new Uint8Array(await a.arrayBuffer())], Array(10).fill(7));
  assert.deepEqual([...new Uint8Array(await b.arrayBuffer())], Array(10).fill(7));
});

test("requests arriving together for the same picture share one drawing (no stampede)", async () => {
  const cache = makeOgCache(1024 * 1024);
  let drawn = 0;
  let finish!: () => void;
  const slow = () => new Promise<Response>((resolve) => { drawn++; finish = () => resolve(new Response(new Uint8Array(50))); });
  const twenty = Array.from({ length: 20 }, () => cache({ title: "Busy chat" }, slow));
  await new Promise((r) => setTimeout(r, 0));
  finish();
  const answers = await Promise.all(twenty);
  assert.equal(drawn, 1);
  for (const a of answers) assert.equal((await a.arrayBuffer()).byteLength, 50);
});

test("over its size limit, the least recently shown picture goes first", async () => {
  const cache = makeOgCache(250);
  await cache("a", png(100));
  await cache("b", png(100));
  await cache("a", png(100)); // a shown again: b is now the oldest
  await cache("c", png(100));
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 200 });
  let redrawn = 0;
  await cache("a", () => { redrawn++; return png(100)(); });
  assert.equal(redrawn, 0);
  await cache("b", () => { redrawn++; return png(100)(); });
  assert.equal(redrawn, 1);
});
