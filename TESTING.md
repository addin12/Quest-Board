# TESTING: how to verify changes

The full QA strategy and manual checklist are in `docs/09-testing-and-qa.md`.

## Suites
| Command (in `web/`) | What it covers | Notes |
|---|---|---|
| `npm run typecheck` (runs `next typegen` first) | Types, **translation keys** (`MsgKey`), **icon names** | Run first; fastest signal |
| `npm run lint` | ESLint (next config) | |
| `npm test` | `tests/unit/*.test.ts`: policy (IDR, canBook, canCancel, location), validation, i18n parity + default language, icon subset vs registry, **placeholder art exists + is script-free + migration v6 back-fill**, **categories (normalize, systemSlug, dictionary coverage, request/offer/profile validation, migration v7 back-fill)**, D&D editions, crypto | Node's built-in runner with native TS stripping. Runs with `--conditions=react-server` (so `server-only` is a no-op) and `--import ./tests/loader.mjs`, a resolve hook for `@/…` and extensionless imports. So **server modules can be unit-tested too**: set `QUESTBOARD_DB` to a temp file and `QUESTBOARD_SEED=false` *before* importing them, and stub `globalThis.fetch` for email (see `mail-delivery.test.ts`, `review-prompts.test.ts`) |
| `npm run test:e2e` | `next build`, then Playwright on **three servers side by side**: `seeded` on **:3100** (`data/e2e.db`), `seeded-2` on **:3102** (`data/e2e-2.db`, the specs listed in `SECOND` in `playwright.config.ts`), and `empty` on **:3101** (`data/e2e-empty.db`) | Uses installed **Edge**; `PW_CHANNEL=chrome` for Chrome. Default locale `en-US`, timezone `Asia/Jakarta` |

Current baseline (2026-09-29): **134 unit tests, 141 e2e tests** (65 in `seeded`, 64 in `seeded-2`, 4 in `empty`, 4 each in `firefox` and `webkit`), all green. Each project runs on its own server and database, one test at a time. The projects run one after another by default, and the full run takes about 16 minutes (it took ~27 when every spec shared one database: pages get slower as a test database fills up). Running the projects side by side (`E2E_WORKERS=3`) was no faster on the dev laptop and made tests time out at random, so it is only worth trying on a machine with more cores: run it in the background, and **don't rebuild while it runs** (the test server uses `.next`).

**Notification assertions:** earlier specs may create similar notifications for the same demo account, so use `.first()` or unique titles.

**Time-based behaviour** (like waitlist offers expiring) is tested by moving timestamps in `data/e2e.db` straight from the spec (`node:sqlite`, `busy_timeout`). **Sign-up volume:** the e2e server runs with `QUESTBOARD_RATE_LIMIT_OVERRIDES=signup=500,login=40`, because specs create many accounts and log in as the same demo users from one IP. P1-9 proves the login limiter at 40 (`E2E_LOGIN_LIMIT`); production keeps 10. Hardening P1-2 archives "Panen Harapan", so later specs must not rely on it.

**Shared steps** live in `tests/e2e/helpers.ts` (`login`, `signup`, `createGmWithGame`, `bookFirstOpenSeat`, `unique`). Specs share one database and run in file order, so **don't assume seeded content is untouched**: find it by content (e.g. "a review with a Report button") and prefer fresh accounts for destructive flows.

**Emails in e2e:** the test server runs with `QUESTBOARD_DEV_OUTBOX=true`, so tests read verification and reset links from `/dev/outbox` (see `linkFromOutbox()` in `accounts.spec.ts`).
**After a client-side navigation**, wait for the new page's heading before filling fields: the old page's inputs can still match for a moment.

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

## Other browsers and time zones

- `cross-browser.spec.ts` runs the main journeys in **Firefox** and **WebKit** (Safari; every iPhone browser) — the `firefox` and `webkit` projects. WebKit drops `Secure` cookies on `http://localhost`, so the e2e servers set the test-only `QUESTBOARD_INSECURE_COOKIES=true`.
- **CI runs in UTC**; the test browser is in `Asia/Jakarta`. Compute browser-local times as Jakarta time (UTC+7), never with the test machine's `getTimezoneOffset()`. Check with `TZ=UTC npm run test:e2e` before pushing anything time-related.
