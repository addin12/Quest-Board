# TESTING: how to verify changes

The full QA strategy and manual checklist are in `docs/09-testing-and-qa.md`.

## Suites
| Command (in `web/`) | What it covers | Notes |
|---|---|---|
| `npm run typecheck` (runs `next typegen` first) | Types, **translation keys** (`MsgKey`), **icon names** | Run first; fastest signal |
| `npm run lint` | ESLint (next config) | |
| `npm test` | `tests/unit/*.test.ts`: policy (IDR, canBook, canCancel, location), validation, i18n parity + default language, icon subset vs registry, **placeholder art exists + is script-free + migration v6 back-fill**, **categories (normalize, systemSlug, dictionary coverage, request/offer/profile validation, migration v7 back-fill)**, D&D editions, crypto | Node's built-in runner with native TS stripping. Imports use `.ts` extensions and relative paths (no `@/`) |
| `npm run test:e2e` | `next build`, then Playwright on **:3100** against a fresh `data/e2e.db` | Uses installed **Edge**; `PW_CHANNEL=chrome` for Chrome. Default locale `en-US`, timezone `Asia/Jakarta` |

Current baseline: **51 unit tests, 45 e2e journeys** (`a11y.spec.ts` 5 + `hardening.spec.ts` 9 + `hire-and-browse.spec.ts` 9 + `marketplace.spec.ts` 16 + `share-calendar-live.spec.ts` 6), all green.

**Accessibility sweep** (`a11y.spec.ts`): `@axe-core/playwright` with WCAG 2.1 A/AA tags on 10 public pages × EN/ID × light/dark, plus signed-in pages and a form with errors. It fails with one line per violation (page → rule → selectors). Add new pages to its lists. Update these numbers when you add tests.

## Writing e2e tests
- **Tests share one DB and run serially** (`workers: 1`), so pick seed data that other tests don't mutate:
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
