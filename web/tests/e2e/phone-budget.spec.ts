import { test, expect, type Page } from "@playwright/test";

// Most players will open Quest Board on a mid-range Android phone over mobile data. Each main page is
// loaded the way such a phone would (Chromium's CPU slowed 4×, a "slow 4G" connection: 150 ms round trips,
// 1.6 Mbit/s down) with an empty cache, and what it downloads is held to a budget so pages can't quietly
// grow. Bytes are exact, so those limits are tight; the time limit is generous (shared CI machines vary).
// Run alone: npx playwright test phone-budget --project=seeded. TESTING.md has the numbers.

type Budget = { path: string; js: number; total: number };
const KB = 1024;
// Measured on 2026-10-05 (round 32, after loading one language and one Alegreya weight: JS 222 → 187–192 KB,
// fonts 125 → 106 KB) plus about 10% headroom. Raise one only for a reason, in the same commit.
const PAGES: Budget[] = [
  { path: "/", js: 210, total: 390 },
  { path: "/games", js: 210, total: 400 },
  { path: "/games/mercusuar-di-pulau-kabut", js: 215, total: 375 },
  { path: "/how-it-works", js: 210, total: 355 },
  { path: "/login", js: 215, total: 360 },
  { path: "/opening", js: 210, total: 355 },
];
const LCP_LIMIT_MS = 8_000; // largest picture or text block drawn, on the slowed phone (1.3–3.4 s on the dev laptop)

async function measure(page: Page, path: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const types = new Map<string, string>();
  const bytes = { js: 0, css: 0, font: 0, img: 0, doc: 0 };
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    const type = types.get(e.requestId);
    // Background prefetches of linked pages (Fetch) depend on what scrolled into view: not counted.
    const key = ({ Script: "js", Stylesheet: "css", Font: "font", Image: "img", Document: "doc" } as const)[type ?? ""];
    if (key) bytes[key] += e.encodedDataLength;
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number };
    w.__lcp = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  const lcp = await page.evaluate(() => (window as unknown as { __lcp: number }).__lcp);
  await cdp.detach();
  const total = bytes.js + bytes.css + bytes.font + bytes.img + bytes.doc;
  return { ...bytes, total, lcp: Math.round(lcp) };
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

for (const b of PAGES) {
  test(`phone budget: ${b.path}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const m = await measure(page, b.path);
    const line = `${b.path}: JS ${(m.js / KB).toFixed(0)} KB, CSS ${(m.css / KB).toFixed(0)} KB, fonts ${(m.font / KB).toFixed(0)} KB, pictures ${(m.img / KB).toFixed(0)} KB, HTML ${(m.doc / KB).toFixed(0)} KB, total ${(m.total / KB).toFixed(0)} KB; largest paint ${m.lcp} ms`;
    info.annotations.push({ type: "phone", description: line });
    console.log(`  [phone] ${line}`);
    if (b.js) expect(m.js, `${b.path}: JavaScript over budget (${line})`).toBeLessThanOrEqual(b.js * KB);
    if (b.total) expect(m.total, `${b.path}: page weight over budget (${line})`).toBeLessThanOrEqual(b.total * KB);
    expect(m.lcp, `${b.path}: slow to draw on a phone (${line})`).toBeLessThanOrEqual(LCP_LIMIT_MS);
  });
}
