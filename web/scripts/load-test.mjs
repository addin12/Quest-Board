// Load test: many people browsing, booking and chatting at once, against a running server.
//
//   npm run load-test -- --base http://localhost:3300 --users 40 --seconds 60 [--db path/to.db]
//
// Point it at a throwaway server with demo data and rate limits off, e.g.
//   QUESTBOARD_DB=/tmp/load.db QUESTBOARD_RATE_LIMIT=off npx next start -p 3300
// Each virtual user signs up, logs in, then loops: public pages (50%), My games (15%),
// notifications (10%), reserving a seat (15%) and table chat (10%). Forms are submitted the way a
// browser without JavaScript does (the hidden $ACTION_* fields), so no browser is needed.
// With --db it also checks afterwards that no session was overbooked.
import { DatabaseSync } from "node:sqlite";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const BASE = arg("base", "http://localhost:3300");
const USERS = Number(arg("users", 40));
const SECONDS = Number(arg("seconds", 60));
const DB = arg("db", "");

const stats = new Map(); // op -> { ms: number[], errors: number, rejected: number }
const stat = (op) => stats.get(op) ?? (stats.set(op, { ms: [], errors: 0, rejected: 0 }), stats.get(op));
const errorSamples = [];

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The <form>…</form> around the first occurrence of `marker` in the page. */
function formAround(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.lastIndexOf("<form", at);
  const end = html.indexOf("</form>", at);
  return start < 0 || end < 0 ? null : html.slice(start, end);
}

function hiddenFields(form) {
  const out = [];
  for (const [tag] of form.matchAll(/<input\b[^>]*>/g)) {
    if (!/type="hidden"/.test(tag)) continue;
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name) out.push([decode(name), decode(/value="([^"]*)"/.exec(tag)?.[1] ?? "")]);
  }
  return out;
}

async function timed(op, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    stat(op).ms.push(performance.now() - t0);
    return result;
  } catch (err) {
    stat(op).errors++;
    if (errorSamples.length < 10) errorSamples.push(`${op}: ${err.message}`);
    return null;
  }
}

let networkRetries = 0;
/** fetch's "fetch failed" hides why; say it (e.g. "other side closed"). */
const why = (err) => `${err.message}${err.cause ? ` (${err.cause.code ?? ""} ${err.cause.message ?? err.cause})` : ""}`;

async function get(path, cookie) {
  const once = () => fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  let res;
  try {
    res = await once();
  } catch (err) {
    // A dropped keep-alive connection: browsers quietly retry a GET once, so the test does too (and counts it).
    networkRetries++;
    if (errorSamples.length < 10) errorSamples.push(`retried GET ${path}: ${why(err)}`);
    try { res = await once(); } catch (again) { throw new Error(`GET ${path}: ${why(again)}`); }
  }
  const body = await res.text();
  if (res.status >= 500 || /database is locked/i.test(body)) throw new Error(`GET ${path} → ${res.status}`);
  return { res, body };
}

/** Load `path`, fill the form containing `marker` like a browser without JavaScript, and submit it. */
async function submit(path, marker, fields, cookie) {
  const { body } = await get(path, cookie);
  const form = formAround(body, marker);
  if (!form) return { status: 0, body: "", location: "", setCookie: [], noForm: true };
  const fd = new FormData();
  for (const [k, v] of hiddenFields(form)) fd.append(k, v);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const res = await fetch(BASE + path, { method: "POST", body: fd, headers: cookie ? { cookie } : {}, redirect: "manual" });
  const text = await res.text();
  if (res.status >= 500 || /database is locked/i.test(text)) throw new Error(`POST ${path} → ${res.status}`);
  return { status: res.status, body: text, location: res.headers.get("location") ?? "", setCookie: res.headers.getSetCookie() };
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function setupUser(i) {
  const email = `load-${Date.now()}-${i}@questboard.test`;
  await timed("signup", () => submit("/signup", 'name="email"', { name: `Load ${i}`, email, password: "tavern-demo-42", role: "player", agree: "on" }));
  const login = await timed("login", () => submit("/login", 'name="email"', { email, password: "tavern-demo-42" }));
  const session = login?.setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("qb_session="));
  if (!session) throw new Error(`user ${i} could not log in (status ${login?.status})`);
  return { cookie: session, booked: new Set() };
}

async function main() {
  console.log(`Load test: ${USERS} users for ${SECONDS}s against ${BASE}`);
  // Discover games, GMs and bookable sessions from the public pages.
  const games = (await (await fetch(`${BASE}/api/games?limit=50`)).json()).data;
  const slugs = games.map((g) => g.slug);
  const gmIds = [...new Set(games.map((g) => g.gm?.id).filter(Boolean))];
  const sessions = []; // { id, slug }
  for (const slug of slugs) {
    const { body } = await get(`/games/${slug}`);
    for (const [, id] of body.matchAll(/href="\/book\/(\d+)"/g)) sessions.push({ id: Number(id), slug });
  }
  console.log(`  ${slugs.length} games, ${sessions.length} bookable sessions`);
  const pages = ["/", "/games", "/browse", "/board", "/hire-a-gm", "/quiz", "/api/games?limit=24", ...slugs.map((s) => `/games/${s}`), ...gmIds.map((id) => `/gms/${id}`)];

  const users = [];
  for (let i = 0; i < USERS; i += 10) users.push(...(await Promise.all(Array.from({ length: Math.min(10, USERS - i) }, (_, j) => setupUser(i + j)))));
  console.log(`  ${users.length} users signed up and logged in`);

  const until = Date.now() + SECONDS * 1000;
  await Promise.all(users.map(async (u) => {
    while (Date.now() < until) {
      const r = Math.random();
      if (r < 0.5) await timed("page", () => get(pick(pages)));
      else if (r < 0.65) await timed("my games", () => get("/dashboard", u.cookie));
      else if (r < 0.75) await timed("notifications", () => get("/notifications", u.cookie));
      else if (r < 0.9 && sessions.length) {
        const s = pick(sessions);
        const out = await timed("reserve", async () => {
          const res = await submit(`/book/${s.id}`, 'name="agree"', { agree: "on" }, u.cookie);
          return res;
        });
        if (out?.location.includes("booked=")) u.booked.add(s.slug);
        else if (out) stat("reserve").rejected++; // full, already booked, … — refused, not an error
      } else if (u.booked.size) {
        const slug = pick([...u.booked]);
        const out = await timed("chat", () => submit(`/games/${slug}`, 'id="msg"', { body: `Hello from load test ${Date.now()}` }, u.cookie));
        if (out?.noForm) stat("chat").rejected++;
      }
    }
  }));

  const pct = (a, p) => (a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
  console.log("\n  op              count   p50 ms   p95 ms   p99 ms   max ms   errors   refused");
  let totalErrors = 0;
  for (const [op, s] of stats) {
    totalErrors += s.errors;
    const row = [op.padEnd(14), String(s.ms.length).padStart(7), ...[50, 95, 99].map((p) => pct(s.ms, p).toFixed(0).padStart(8)), Math.max(0, ...s.ms).toFixed(0).padStart(8), String(s.errors).padStart(8), String(s.rejected).padStart(9)];
    console.log("  " + row.join(" "));
  }
  const total = [...stats.values()].reduce((n, s) => n + s.ms.length, 0);
  console.log(`\n  ${total} requests in ${SECONDS}s ≈ ${(total / SECONDS).toFixed(1)} per second; ${totalErrors} errors; ${networkRetries} GET(s) retried after a dropped connection`);
  for (const e of errorSamples) console.log(`  ! ${e}`);

  if (DB) {
    const db = new DatabaseSync(DB, { readOnly: true });
    const over = db.prepare(
      `SELECT s.id, g.seats_total, COUNT(b.id) AS booked FROM game_sessions s JOIN games g ON g.id = s.game_id
         JOIN bookings b ON b.session_id = s.id AND b.status = 'confirmed' GROUP BY s.id HAVING booked > g.seats_total`,
    ).all();
    db.close();
    console.log(over.length ? `  ! OVERBOOKED sessions: ${JSON.stringify(over)}` : "  No session is overbooked.");
    if (over.length) process.exitCode = 1;
  }
  if (totalErrors) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
