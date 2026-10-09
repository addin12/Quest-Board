# TESTING: how to verify changes

The full QA strategy and manual checklist are in `docs/09-testing-and-qa.md`.

## Suites
| Command (in `web/`) | What it covers | Notes |
|---|---|---|
| `npm run typecheck` (runs `next typegen` first) | Types, **translation keys** (`MsgKey`), **icon names** | Run first; fastest signal |
| `npm run lint` | ESLint (next config) | |
| `npm test` | `tests/unit/*.test.ts`: policy (IDR, canBook, canCancel, location), validation, i18n parity + default language, icon subset vs registry, **placeholder art exists + is script-free + migration v6 back-fill**, **categories (normalize, systemSlug, dictionary coverage, request/offer/profile validation, migration v7 back-fill)**, D&D editions, crypto | Node's built-in runner with native TS stripping. Runs with `--conditions=react-server` (so `server-only` is a no-op) and `--import ./tests/loader.mjs`, a resolve hook for `@/…` and extensionless imports. So **server modules can be unit-tested too**: set `QUESTBOARD_DB` to a temp file and `QUESTBOARD_SEED=false` *before* importing them, and stub `globalThis.fetch` for email (see `mail-delivery.test.ts`, `review-prompts.test.ts`) |
| `npm run test:e2e` | `next build`, then Playwright on **three servers side by side**: `seeded` on **:3100** (`data/e2e.db`), `seeded-2` on **:3102** (`data/e2e-2.db`, the specs listed in `SECOND` in `playwright.config.ts`), and `empty` on **:3101** (`data/e2e-empty.db`) | Uses installed **Edge**; `PW_CHANNEL=chrome` for Chrome. Default locale `en-US`, timezone `Asia/Jakarta` |

Current baseline (2026-10-09, round 36): **183 unit tests, 181 e2e tests** (94 in `seeded`, 71 in `seeded-2`, 6 in `empty`, 5 each in `firefox` and `webkit`), all green. Each project runs on its own server and database, one test at a time. The projects run one after another by default, and the full run takes about 16 minutes (it took ~27 when every spec shared one database: pages get slower as a test database fills up). Running the projects side by side (`E2E_WORKERS=3`) was no faster on the dev laptop and made tests time out at random, so it is only worth trying on a machine with more cores: run it in the background, and **don't rebuild while it runs** (the test server uses `.next`).

**Notification assertions:** earlier specs may create similar notifications for the same demo account, so use `.first()` or unique titles.

**Time-based behaviour** (like waitlist offers expiring) is tested by moving timestamps in `data/e2e.db` straight from the spec (`node:sqlite`, `busy_timeout`). **Sign-up volume:** the e2e server runs with `QUESTBOARD_RATE_LIMIT_OVERRIDES=signup=500,login=40`, because specs create many accounts and log in as the same demo users from one IP. P1-9 proves the login limiter at 40 (`E2E_LOGIN_LIMIT`); production keeps 10. Hardening P1-2 archives "Panen Harapan", so later specs must not rely on it.

**Shared steps** live in `tests/e2e/helpers.ts` (`login`, `signup`, `createGmWithGame`, `bookFirstOpenSeat`, `unique`). Specs share one database and run in file order, so **don't assume seeded content is untouched**: find it by content (e.g. "a review with a Report button") and prefer fresh accounts for destructive flows.

**Emails in e2e:** the test server runs with `QUESTBOARD_DEV_OUTBOX=true`, so tests read verification and reset links from `/dev/outbox` (see `linkFromOutbox()` in `accounts.spec.ts`).
**After a client-side navigation**, wait for the new page's heading before filling fields: the old page's inputs can still match for a moment.

**Phone budget** (`phone-budget.spec.ts`): six main pages loaded as a mid-range Android phone would (390 px, CPU slowed 4×, "slow 4G": 150 ms round trips, 1.6 Mbit/s) with an empty cache. Each has a limit on JavaScript and on total download (scripts, styles, fonts, pictures, HTML; background prefetches of linked pages not counted), set at the measured size plus about 10%, and the largest paint must come within 8 s. Round 32 (2026-10-05): JS 187–192 KB, fonts 106 KB, total 322–361 KB, largest paint 1.3–3.4 s on the dev laptop — after the browser stopped downloading both languages (−35 KB of JS) and the h3 font shipped one weight instead of nine (43 → 24 KB). Round 35 (2026-10-09) raised the totals by about 30 KB: each language's strings now come with the page (HTML 43–55 KB) because, as a separate chunk, they left iPhones ignoring the first tap. Round 36 sent only the strings client code uses (a quarter of them), and the totals came back to round 32's (333–362 KB); the limits were tightened again. Raise a limit only for a reason, in the same commit.

**Accessibility sweep** (`a11y.spec.ts`): `@axe-core/playwright` with WCAG 2.1 A/AA tags on the public pages × EN/ID × light/dark, the same pages at 360 px phone width, signed-in, admin and brand-new GM/player pages, and a form with errors. It fails with one line per violation (page → rule → selectors). Add new pages to its lists. Update these numbers when you add tests.

## Writing e2e tests
- **Specs in the same project share one DB and run serially** (`workers: 1` per project), so pick seed data that other tests don't mutate. `e2eDb()` opens the database of the project the test runs in; keep specs that depend on each other in the same project (e.g. `hardening` and `marketplace` below).
  - **The demo player (Andi, `player@questboard.test`) has no seat in** *Neon Run* (`neon-run-satu-malam-di-neo-surabaya`) or *Starfall Salvage* (`starfall-salvage`). Use these for booking flows.
  - **Andi has an unreviewed past session in** *Mercusuar di Pulau Kabut*. Use it for the review flow.
- **Spec files run alphabetically** against the same DB: `hardening`, then `marketplace`. `hardening` archives *Panen Harapan*, so don't use that game elsewhere.
- **The login rate limit** is 10 per 10 min per IP+email. Tests that log in repeatedly as the same user can hit it; use a different seed account (`putri@`, `bima@`, `dewi@`…) or set `QUESTBOARD_RATE_LIMIT=off` in the webServer env.
- **Seeding bulk data:** tests may open `data/e2e.db` directly with `node:sqlite` (WAL allows concurrent access). See the chat-volume test.
- **Picker radios** are visually hidden, so use `getByRole("radio", { name, exact: true })` with `.check({ force: true })`, or click the visible caption text. `exact` matters: "Portrait 1" also matches "Portrait 10".
- **Selectors:** prefer `getByRole` or `getByLabel` with exact names. Watch for strict-mode collisions, such as a section named "Reviews" next to a "Review" textbox.
- **Language:** to test Indonesian, click the `id` switcher button. Browser locale does **not** change the language, because English is the default.
- **Revalidation can unmount forms.** After a server action, success is often shown by the page state (for example the review appears) rather than by the form.

## Screenshots (visual check)
1. Start a throwaway server:
   ```bash
   node scripts/reset-db.mjs data/shots.db
   QUESTBOARD_DB=data/shots.db npx next start -p 3200   # run in the background
   ```
2. Write a small Playwright script in `web/scripts/_shots.mjs` that imports `chromium` from `@playwright/test` and uses `{ channel: "msedge" }`. Capture light and dark, EN and ID, at 1280 px and 390 px.
3. Save doc screenshots to `docs/screenshots/`, then delete the script.
4. Stop port 3200 (PowerShell command in MEMORY.md) and delete `data/shots.db*`.

## Before you say "done"
- [ ] typecheck + lint + unit tests pass
- [ ] e2e passes (for user-facing changes)
- [ ] Checked in EN **and** ID, light **and** dark, desktop **and** mobile
- [ ] No payment details leak: check the API output and public pages
- [ ] Docs, MEMORY.md and the test counts above are updated

## Security and load checks

- **Permissions** (`permissions.spec.ts`): signed in as one person, each form's hidden ids are pointed at someone else's booking, session, review, notice, request or game and submitted (as someone editing the page in their browser would); nothing may change. Add new actions to it.
- **Keyboard only** (`keyboard.spec.ts`): the newest flows are finished with Tab / Enter / arrows and typing, and every focus stop must show a focus ring.
- **Load test** (`npm run load-test -- --base <url> --users 40 --seconds 60 [--db <file>]`): virtual users sign up, log in, browse, book and chat at once (forms posted like a browser without JavaScript); reports p50/p95/p99 per operation, errors, and with `--db` whether any session was overbooked. Run it against a throwaway server (`QUESTBOARD_RATE_LIMIT=off`), never production data. Baseline on the dev laptop (one Node process): ~65–90 requests/s, **0 errors, 0 overbooked** at 40 and 100 users with no think time (p95 ≈ 0.8 s at 40 users; the limit is page rendering CPU, ~11–29 ms per page). Re-run on 2026-09-29 after rounds 18–20 (script nonce, session activity, scam checks): same — 66 req/s at 40 users, 75 at 100, 0 errors. Posting to table chat is the slowest action (it re-renders the game page with up to 200 messages): ~1.2 s median at 40 users, ~2.9 s at 100. Reset the load database between runs: a 40-user run fills every seat, and the next run then skips booking and chat.

## Slow phones

Measured 2026-09-28 on a production build: 390 px phone, "Slow 4G" (1.6 Mbps, 150 ms) and a 4× slower CPU (Chrome DevTools throttling). Every page is **380–440 KB** (scripts ~205 KB — React and Next.js; fonts 125 KB after dropping two unused Alegreya Sans weights, was 160 KB; CSS 15 KB; images 5–30 KB). Server response 40–190 ms. First content: login 1.5–2 s, most pages 2.3–2.9 s, the home page ~2.9 s. The home page is the longest page to lay out and draw on a slow CPU: since round 18 its sections below the hero use the `defer-render` utility (`content-visibility: auto` — still in the HTML, drawn only when scrolled near), which took it from ~3.9 s to ~2.9 s and cut layout time from 2.5 s to 1.6 s. It made no measurable difference on the footer, on game cards, or on the game page's reviews (round 19: interleaved A/B on one build — the other pages are cheap enough to draw), so measure before adding it anywhere else. To A/B fairly, route the CSS through Playwright in **both** variants (`route.fetch` skips the simulated slow network).

## In CI

Every push runs, side by side: `test` (audit, typecheck, lint, unit tests), `e2e` in two halves
(a: `seeded`, `empty`, `firefox`, `webkit`; b: `seeded-2` with the axe sweep), the rehearsal on x86
and ARM (each with an image scan), and the load rehearsal. On `main`, the image is built and published once all of them pass. Locally, a background job is
stopped after about 30 minutes, so run the suite the same way in two goes:
`TZ=UTC npm run build && TZ=UTC npx playwright test --project=seeded --project=empty --project=firefox --project=webkit`,
then `TZ=UTC npx playwright test --project=seeded-2`.

## Production rehearsal (Docker)

`npm run rehearsal` (in `web/`, needs Docker Desktop running) builds the production image and starts the real deployment kit from `deploy/` — app, scheduler and Caddy — on **https://localhost:8443** with Caddy's local certificate, a fresh empty volume and none of the test-only switches (`deploy/rehearsal/rehearsal.env`). Then `tests/rehearsal/` checks what the e2e servers can't, because they run over plain http with test shortcuts: http → https redirect, HSTS and `upgrade-insecure-requests`, Secure cookies, no developer pages, the scheduler actually running the job, the first admin from the CLI, the admin console requiring two-step login, the setup check, a real backup, no CSP violations over HTTPS, a restart keeping everything, a **restore drill** (delete the database, backups and pictures, bring them back with `db:fetch-offsite` and `db-backup.mjs restore`, and check the site and a picture again), old off-site copies being deleted, a sign-up email going through Brevo while Resend answers "limit reached", the containers' **memory** against their caps, and **`deploy/update.sh`**: a healthy version stays, and a broken one (an image that changes the database, then crashes) is rolled back by itself with the database as it was.

The load test reports "chat" and "reserve" as two requests (opening the page, then sending), and also
"chat: send" and "reserve: send" alone — what a person waits for after pressing the button.

`npm run load-rehearsal` (needs Docker) starts the same kit with demo data and the per-IP limits off (all virtual users come from one machine) and runs `scripts/load-test.mjs` with 100 virtual users while sampling memory; it fails on any error, an overbooked session, or memory within 10% of a cap. CI runs it after the x86 rehearsal (90 seconds). Measured on 2026-10-01 (Docker Desktop on the development laptop): 100 users clicking without pause for 2 minutes made about 52 requests a second with 0 errors and 0 overbooked sessions; the app peaked at about 390 MB of its 768 MB cap and the scheduler at about 30 MB. At that saturation pages take 1.7 s (median) to 3 s (p95) — a 1,000-member community on its busiest evening makes perhaps 1–3 requests a second, so there is plenty of room. With the standalone image (round 28) the app peaked lower, at about 260 MB, and that run made 42.5 requests a second — laptop runs vary by about this much, so compare CI runs before reading anything into it. Round 29 (no npm in the image, 130-second keep-alive): 59.4 requests a second, 0 errors, app peak about 250 MB; under that load sending a chat message (1.8 s median) costs the same as loading a page (1.7 s). Round 32 (compression by Caddy only, not also by the app): 64.5 requests a second, 0 errors, pages 1.6 s median and 2.0 s p95 (round 31: 42.6 a second, 4.9 s p95), app peak 247 MB. Each run is now compared with `scripts/load-baseline.json` and posts its numbers on the CI run (a warning when it falls well behind). Email and off-site backups go to stand-ins for Resend and S3 (`scripts/rehearsal-fakes.mjs`, the "fakes" service; it re-checks each upload's signature), so the rehearsal also follows a sign-up through its emailed link and checks the off-site copy. It removes the stack afterwards (`--keep` leaves it running). It runs in CI as its own job on every push — on both x86 and **ARM** (Oracle's free servers) — and locally before each deployment and after changing anything in `deploy/` (it is not part of `test:e2e`). (Its first run caught HSTS missing from Docker deployments: `next.config.ts` headers are fixed at build time, so anything that depends on production settings belongs in `src/proxy.ts`.)

## Other browsers and time zones

- `cross-browser.spec.ts` runs the main journeys in **Firefox** and **WebKit** (Safari; every iPhone browser) — the `firefox` and `webkit` projects. WebKit drops `Secure` cookies on `http://localhost`, so the e2e servers set the test-only `QUESTBOARD_INSECURE_COOKIES=true`.
- **CI runs in UTC**; the test browser is in `Asia/Jakarta`. Compute browser-local times as Jakarta time (UTC+7), never with the test machine's `getTimezoneOffset()`. Check with `TZ=UTC npm run test:e2e` before pushing anything time-related.
