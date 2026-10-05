// Launch-day smoke test: checks a live Quest Board from the outside, changing nothing (only GET requests).
//
//   node scripts/smoke.mjs https://questboard.id
//
// Runs anywhere with Node 22+ (your laptop, or the server: docker compose exec app node scripts/smoke.mjs …).
// Each line is ✓ (fine), ! (works, but worth a look before launch) or ✗ (fix this). Exit code 1 when any ✗.
// It covers what can be seen from outside; Admin → Setup covers the settings only the server knows.
import { pathToFileURL } from "node:url";

// Two of the demo games (src/lib/seed.ts): a live site should have neither.
const DEMO_TITLES = ["Mercusuar di Pulau Kabut", "Darah di Balik Tirai Beludru"];

/** The checks, in the order a visitor meets them. Resolves to [{ level: "ok" | "warn" | "fail", what, why? }]. */
export async function smoke(address) {
  const base = address.replace(/\/+$/, "");
  const origin = new URL(base);
  const results = [];
  const check = (cond, what, why, soft = false) => results.push(cond ? { level: "ok", what } : { level: soft ? "warn" : "fail", what, why });
  const get = async (path, init = {}) => {
    try {
      return await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });
    } catch (err) {
      return { status: 0, headers: new Headers(), text: async () => "", json: async () => ({}), error: err?.cause?.code ?? String(err) };
    }
  };

  // 1. HTTPS (a test address with its own port, like the rehearsal's, has no plain-http twin on port 80)
  if (origin.protocol === "https:") {
    const plain = await get(`http://${origin.hostname}/browse`);
    check([301, 302, 307, 308].includes(plain.status) && (plain.headers.get("location") ?? "").startsWith("https://"),
      "http:// redirects to https://", `got ${plain.status || plain.error} instead of a redirect`, origin.port !== "");
  } else {
    check(false, "the site runs on HTTPS", "the address is http://: passwords would cross the network unencrypted");
  }

  // 2. The home page and its headers
  const home = await get("/", { headers: { "accept-encoding": "zstd, br, gzip" } });
  check(home.status === 200, "the home page answers 200", `got ${home.status || home.error}`);
  const h = home.headers;
  const csp = h.get("content-security-policy") ?? "";
  check(/max-age=\d{7,}/.test(h.get("strict-transport-security") ?? ""), "HSTS is on (a year)", "set QUESTBOARD_ENFORCE_HTTPS=true");
  check(/'nonce-[^']+'/.test(csp), "the script policy uses a per-page nonce", "no nonce'd Content-Security-Policy header");
  check(csp.includes("upgrade-insecure-requests"), "the script policy upgrades insecure requests", "set QUESTBOARD_ENFORCE_HTTPS=true");
  check(h.get("x-content-type-options") === "nosniff" && h.get("x-frame-options") === "DENY", "nosniff and no framing", "security headers missing: is a proxy stripping them?");
  check(!h.get("x-powered-by"), "no X-Powered-By header", "the server announces its software");
  check(["zstd", "br", "gzip"].includes(h.get("content-encoding") ?? ""), "pages are compressed", "no Content-Encoding: let the proxy compress (Caddy: encode zstd gzip)", true);
  const html = home.status === 200 ? await home.text() : "";
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? "";
  check(canonical.startsWith(base), "links point at this address (canonical URL)", `the canonical URL is ${canonical || "missing"}: check QUESTBOARD_BASE_URL`);

  // 3. Health: database, scheduler, email queue
  const health = await get("/api/health?full=1");
  const hj = await health.json().catch(() => ({}));
  check(health.status === 200 && hj.ok === true, "health check passes (database, scheduler, emails)", `status ${health.status || health.error}: ${JSON.stringify(hj)}`);
  check(typeof hj.cron === "object", "the scheduled job is set up", "cron \"not configured\": set QUESTBOARD_CRON_SECRET (reminders and emails wait for visitors otherwise)", true);
  check(typeof hj.email === "object", "an email provider is set up", "email \"not configured\": nobody can verify their address", true);

  // 4. Public pages
  for (const path of ["/browse", "/how-it-works", "/board", "/hire-a-gm", "/become-a-gm", "/login", "/signup", "/terms", "/privacy"]) {
    const r = await get(path);
    check(r.status === 200, `${path} answers 200`, `got ${r.status || r.error}`);
  }
  const terms = await (await get("/terms")).text();
  check(!terms.includes("Draft for launch"), "Terms and Privacy are final", "they still show the draft notice: have them reviewed, then set QUESTBOARD_LEGAL_FINAL=true", true);

  // 5. Search engines
  const robots = await get("/robots.txt");
  const robotsText = robots.status === 200 ? await robots.text() : "";
  check(robotsText.includes(`Sitemap: ${base}/sitemap.xml`), "robots.txt points at this sitemap", `robots.txt says: ${/Sitemap: .*/.exec(robotsText)?.[0] ?? `(status ${robots.status})`}`);
  const sitemap = await get("/sitemap.xml");
  const sitemapText = sitemap.status === 200 ? await sitemap.text() : "";
  const locs = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check(locs.length > 0 && locs.every((u) => u.startsWith(base)), `sitemap.xml lists ${locs.length} pages on this address`,
    locs.length ? `some point elsewhere, e.g. ${locs.find((u) => !u.startsWith(base))}` : `status ${sitemap.status}`);

  // 6. Nothing for developers or tests
  for (const path of ["/dev/outbox", "/dev/emails"]) {
    const r = await get(path);
    check(r.status === 404, `${path} doesn't exist`, `got ${r.status}: a test-only setting (QUESTBOARD_DEV_OUTBOX) is on in production`);
  }
  const games = await (await get("/api/games")).json().catch(() => ({}));
  check(!(games.data ?? []).some((g) => DEMO_TITLES.includes(g.title)), "no demo data", "demo games are listed: deploy with QUESTBOARD_SEED=false");

  // 7. Cookies the site sets are Secure
  const cookies = (await get("/login")).headers.getSetCookie?.() ?? [];
  const insecure = cookies.find((c) => !/;\s*Secure/i.test(c));
  check(!insecure || origin.protocol !== "https:", "cookies are Secure", `a cookie without Secure: ${insecure?.split(";")[0]}`);

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const address = process.argv[2] ?? "";
  if (!/^https?:\/\/[^/]+\/?$/.test(address)) {
    console.error("Usage: node scripts/smoke.mjs https://your-domain");
    process.exit(2);
  }
  const all = await smoke(address);
  const mark = { ok: "✓", warn: "!", fail: "✗" };
  console.log(`Smoke test of ${address}\n`);
  for (const r of all) console.log(`  ${mark[r.level]} ${r.what}${r.why ? `\n      ${r.why}` : ""}`);
  const fails = all.filter((r) => r.level === "fail").length;
  const warns = all.filter((r) => r.level === "warn").length;
  console.log(`\n${all.length - fails - warns} fine, ${warns} to look at, ${fails} to fix.${fails ? "" : " Next: the smoke test by hand (docs/12-launch-checklist.md)."}`);
  process.exit(fails ? 1 : 0);
}
