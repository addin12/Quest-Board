# 09 · Testing & QA

## 1. Strategy

| Layer | Tool | Covers | Command (in `web/`) |
|---|---|---|---|
| Static | TypeScript strict + ESLint | Types, including **every translation key** (`MsgKey`) | `npm run typecheck` · `npm run lint` |
| Unit | `node:test` + Node type-stripping | Business rules, IDR parsing and formatting, validation, **i18n completeness** | `npm test` |
| End-to-end | Playwright on the production build, local Edge (`PW_CHANNEL=chrome` for Chrome) | Real journeys in **EN and ID locales** against a fresh seeded DB (`data/e2e.db`), timezone Asia/Jakarta | `npm run test:e2e` |
| Manual | Checklist below | Copy quality, visuals, responsiveness, accessibility | – |

## 2. Automated suite (all passing)

### Unit tests (32)
- **IDR:**
  - `formatIdr` → `Rp 75.000`, `Rp 1.250.000`, `Rp 0`.
  - `parseIdr` accepts `75.000`, `Rp 75,000` and `75000`; empty input is 0; garbage is rejected.
- **Rules:**
  - Cancellation is allowed only before the start.
  - `canBook` happy path plus all 6 rejections, each returning the right translation key.
- **Validation:**
  - Email normalisation, and **role escalation blocked**.
  - Rupiah price parsing; bounds (> Rp 10.000.000 rejected); seat bounds.
  - Platform or city conditional; play language defaults to `id`.
  - Session local time → UTC; past and garbage dates rejected.
  - Review bounds.
  - Validation returns keys, not sentences.
- **i18n:** ID and EN have **identical key sets** with no empty strings; `{placeholders}` match per key; plural and interpolation behaviour.
- **Crypto:** scrypt round-trip, salting, token hashing.
- **Default language:** `DEFAULT_LANG` is `en` and English is listed first.
- **GM location:** `normalizeLocation` trims and collapses spaces; "online", "ONLINE " and empty all become "Online"; `isOnlineLocation`.
- **Icons:** every name in `src/lib/icons.ts` exists in the generated subset CSS, and the Flaticon credit comment is present. This catches a forgotten `npm run icons`.
- **Systems:** `D&D 5e (2014)` and `D&D 5.5e (2024)` both exist, and there is no bare `D&D 5e`.

### End-to-end journeys (22)
`hardening.spec.ts` holds 9 regression tests for the v0.5 fixes: security headers, literal `%`/`_` search, login rate limit (and the email is kept), no overbooking via seat edits, chat shows the newest of 205 messages, archive releases seats, log out on all devices, anti-scam note, forms keep input after errors.

`marketplace.spec.ts` holds these 13:
1. **English by default:** even an `id-ID` browser gets `lang="en"` and English copy, with EN shown active. The switcher changes to ID, and the choice persists across pages.
2. Prices appear in **Rupiah**. Free games say **Free**, or **Gratis** after switching to ID.
3. Anonymous browse → filter → game page. Safety info visible; the "0% commission" note is shown; **chat and GM payment details are hidden**.
4. **Play-language filter:** `language=en` includes English and bilingual tables and excludes Indonesian-only ones.
5. **D&D editions:**
   - The `D&D 5.5e (2024)` filter shows only the 2024 table, and `D&D 5e (2014)` only the 2014 one.
   - Keyword search "D&D" finds both.
6. **Icons:** the header d20 renders with the subset font (`qb-uicons-sr`), and the "Uicons by Flaticon" credit links to flaticon.com/uicons.
7. Protected routes redirect to login.
8. **Reserve a seat without payment:**
   - No card fields; the page shows "You pay Rp 80.000 directly to the GM"; the rules checkbox is enforced.
   - After booking, the **GM's payment details** and the table chat appear.
   - The player posts a message, then gives up the seat and sees "Cancelled by you".
9. Review a played game (one per game).
10. **New GM:**
   - Signs up and adds payment details.
   - Creates a game priced **75.000** and sees "Rp 75.000 per seat · you keep 100%".
   - Schedules a session; the game appears in search.
11. A player cannot open the GM dashboard.
12. **API:** returns `price: {amount, currency: "IDR"}` and `language`, **never contains payment details**, and gives 404 for unknown slugs.
13. **GM location:** Raka's profile shows "Location: Jakarta" and Bima's shows "Location: Online"; no "Timezone" appears anywhere. (In journey 10, the new GM types "online", which is saved as "Online".)

## 3. Test data
All accounts use the password `password123`.

| Email | Role | Notes |
|---|---|---|
| `player@questboard.test` | Player (Andi Wijaya) | Upcoming seats + unreviewed past games |
| `gm@questboard.test` | GM (Raka Pradipta, verified) | 3 games (2 Indonesian, 1 English), BCA/GoPay payment details |
| `dewi@`, `bima@`, `nadia@questboard.test` | GMs | Nadia is based in WITA |
| `putri@`, `fajar@`, `intan@`, `yoga@`, `citra@questboard.test` | Players | |
| `admin@questboard.test` | Admin | |

Run `npm run db:reset` to re-seed. An outdated v1 database is backed up automatically (`*.v1.bak`) on first start.

## 4. Manual QA checklist (per release)
- [ ] **Copy review by a native Indonesian speaker** for new or changed strings (tone: friendly *kamu*).
- [ ] Every page in **both** languages at 360 px, 768 px and 1280 px. Longer Indonesian strings wrap and don't truncate.
- [ ] Switching language keeps you on the same page; the switcher works with JS disabled.
- [ ] Prices: `Rp` formatting everywhere (cards, detail, reserve summary, dashboard, GM tiles); inputs accept dots.
- [ ] Times show WIB for Jakarta users; with the OS set to Asia/Makassar they show WITA.
- [ ] Payment details: visible only after reserving; never on the public profile, in search results or in the API.
- [ ] No leftover wording implying on-platform payment ("checkout", "pay now", "refund processed").
- [ ] Light and dark theme, keyboard-only navigation, screen reader announces the correct language.
- [ ] Icons render (no empty boxes) in Chrome, Edge, Firefox and Safari; icon-only header buttons have labels; the "Uicons by Flaticon" credit is in the footer.
- [ ] Two browsers race for the last seat: exactly one succeeds.

## 5. Next additions
- Axe accessibility assertions in the e2e journeys.
- A visual regression snapshot per language.
- A CI pipeline (typecheck → lint → unit → build → e2e).
- A load test for concurrent reservations.
- A "no hard-coded UI strings" lint rule (e.g. `i18next/no-literal-string` adapted to our `t()`).
