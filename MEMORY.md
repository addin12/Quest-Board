# MEMORY: product decisions & project history

This is the decision log. Treat these entries as requirements: they came from the product owner's feedback. Add new decisions at the top of **Decision log** with the date, the decision, and why.

## Current state (v0.10, 2026-09-25)
- A working MVP plus 11 spec docs, in git (`main`) with GitHub Actions CI (`.github/workflows/ci.yml`). There is no remote yet: push to GitHub to turn CI on.
- Schema version is **10**. Real migrations live in `web/src/lib/migrations.ts`; v4 is the baseline.
- 57 unit tests and 57 e2e journeys (including 6 axe accessibility sweeps), all passing.
- All IMPROVEMENTS P1 items are done. Next up is P2, which needs product-owner approval.

## Decision log

### v0.11, 2026-09-25: big upgrade, iterations 1–2 (product owner: "all of it yes, but please every upgrade iteration you get to quality checks for it")
- **Process rule:** every iteration ends with a QC pass: diff review, typecheck, lint, unit, full e2e + axe, and EN/ID light/dark mobile screenshots. Then a git commit.
- Iteration 1: git (`main`) + GitHub Actions CI. There's no remote yet. The commit author is the email handle `addinalayubi12`, because the user's real name isn't known.
- Iteration 2: share buttons + OG images, Add to calendar (Google + .ics), live chat via polling (20 s).
  - **Absolute URLs** come from `QUESTBOARD_BASE_URL` (required in production) or the request host.
  - Instagram has no web share intent, so the native share sheet covers it.
- Iteration 3: accounts & legal.
  - **A verified email is required only for GM requests and offers** (anti-spam). Booking stays open to unverified accounts. Existing and demo accounts are grandfathered as verified.
  - **Deletion scrubs rather than removes:** name becomes "Anonymous", email `deleted-<id>@deleted.invalid`, and reviews/chats are kept. A GM's games are archived and players notified.
  - Emails go to `email_outbox`, and are delivered through Resend only when `RESEND_API_KEY` + `QUESTBOARD_MAIL_FROM` are set.
  - The legal texts are **drafts** for a lawyer to review. The contact email comes from `QUESTBOARD_CONTACT_EMAIL`.
- Iteration 4: moderation.
  - **Removing a review or message deletes it** (so ratings stay honest). The report keeps a snapshot as evidence. Removing a game archives it.
  - **Suspension** blocks login, archives games (players notified), withdraws offers and hides the GM profile. Unsuspending restores login only.
  - Admins can't be suspended.
  - Reporters stay anonymous to the reported person.
  - The admin console 404s for everyone else.

### v0.10, 2026-09-25: medieval tavern theme + bell popover (product owner feedback)
- **Visual identity is now "medieval tavern"** (supersedes v0.1's "warm, bookish" look).
  - Palette and scopes: parchment light theme, candlelit dark theme, dark-oak `.on-wood` header, footer, tab bar and hero.
  - Type: Cinzel + Alegreya + Alegreya Sans.
  - Art: tavern textures and hero from `npm run tavern-art`.
  - Details are in DESIGN.md.
- **The notification bell is a popover** (8 latest, "See all" → `/notifications`). Opening it marks all read through `markNotificationsReadAction`. The wording is shared through `lib/notification-view.ts`.

### v0.9.2, 2026-09-25: Indonesian terminology (product owner, native speaker)
- Keep *kamu* and **pesan kursi**. "Hire a GM" is **Cari GM**.
- More English jargon: **table, session, campaign** (possessive *table-mu*, *session-mu*), **offline** instead of *tatap muka*, **beginner** instead of *pemula*, and **chat** for messages, so *pesan* only means booking.
- Applied to 101 `id` strings. The glossary lives in DESIGN.md "Content & voice". The product owner is a native speaker, so **ask them about Indonesian wording** rather than guessing.

### v0.9.1, 2026-09-25: quality pass (product owner: "could you do quality check…", then "fix the optional too")
- **In-app notifications** (`notifications` table, `lib/notifications.ts`).
  - Kinds: `request_direct`, `offer_received`, `offer_chosen`, `request_message` (collapsed into one unread row per request), `booking_new`, `booking_cancelled`, `session_cancelled`.
  - Opening `/notifications` marks everything read, and opening a request page marks that request's notifications read.
  - Open public requests are **not** fanned out to every GM. The notifications page shows a count card linking to `/gm/requests` instead.
  - Email and WhatsApp delivery stay in P2-12, because they need a provider.
- **Mobile:** below `sm`, page links live in a bottom tab bar, and the header keeps logo, language, bell, avatar and log out. (The signed-in header used to overflow at 320–390 px.)
- **Accessibility:** `errAttrs(id, msg)` + `<FieldError id>` on every form field. There's an axe e2e sweep (`tests/e2e/a11y.spec.ts`).
  - `--accent-soft` changed to #faebe4 and `--success-soft` to #e9f5ec (light theme), to reach 4.5:1 contrast with the text colour.
- **Systems:** `/browse/system/<slug>` also resolves known systems with no published games (empty state + GMs + request CTA). The hub lists them as chips.
- **Indonesian:** I reviewed the strings myself; this is not a native-speaker review (P2-18 stays open).

### v0.9, 2026-09-25: settings, browse by category, hire a GM (product owner feedback)
- **`/settings` for every user**: name, bio, language, a portrait from the shared library (players included), password change, and log out everywhere.
  - "Log out on all devices" moved here from the dashboard.
  - Changing the password rotates the session and ends all others.
  - The email address can't be changed yet, because there is no verification (P2-2).
- **Categories are a fixed taxonomy** in `lib/categories.ts`: 10 genres and 9 play styles.
  - A game has at most 3 of each, stored as CSV in `games.genres`/`games.styles`. Free-text `tags` stay alongside.
  - Game systems stay free text. Their browse URL is `systemSlug(system)` ("D&D 5.5e (2024)" becomes `dnd-5-5e-2024`), and 10 systems have a translated blurb.
- **Hire a GM = directory + request/offer flow.**
  - StartPlaying's page is only a directory. We added requests because Quest Board has no checkout, so players need a way to reach a GM for a private group.
  - Status moves `open` → `matched` (the requester chose an offer) or `closed`.
  - One offer per GM per request.
  - A request with `gm_id` set goes only to that GM.
- **Privacy:** a request is visible only to the requester, eligible GMs (all GMs for open requests, only the target GM for direct ones), and GMs who already offered. Everyone else gets 404.
  - The matched GM's `payment_info` is shown **only to the requester, only after matching**, with the anti-scam note.
  - The private thread is limited to the requester and the matched GM.
- **Rate limits:** requests 5/h, offers 30/h, password changes 5 per 15 min.
- Still no payments or fees: the offer price is informational and paid to the GM directly.
- **QC pass (same day):** only *open* requests can be closed, because a matched request keeps its thread and payment details. Choosing or closing twice is a no-op, not an error page. Sending an offer needs a finished GM profile (headline). GMs can't save a bio under 30 characters in /settings.

### v0.8, 2026-09-25: GM portrait picker (product owner: "yes please go on")
- **GMs pick a profile picture from a library of 12 illustrated portraits**, or keep their initials.
  - The library is `PORTRAIT_LIBRARY` in `src/lib/placeholders.ts`, with files in `public/images/gms/library/`.
  - There are 8 styles (4 new: wizard-hat, short-hair, curly-hair, bun-glasses) across varied skin tones.
- **Allow-list** `isAllowedPortrait()`: `""`, a library path, or the GM's current portrait, so seeded GMs keep their unique art.
- Players still use initials only; there is no player profile page yet. No schema change: `users.avatar_image` has existed since v6.

### v0.7, 2026-09-25: GM cover picker (product owner: "yes please improve for next step")
- **GMs choose a cover for their games from a built-in library** of 10 motif illustrations (`COVER_LIBRARY` in `src/lib/placeholders.ts`, files in `public/images/covers/library/`), or keep the colour gradient.
- **Allow-list:** the server accepts only `""`, a library path, or the game's *current* cover (so demo games keep their unique art), via `isAllowedCover()`. Custom uploads remain future work (IMPROVEMENTS P3-2).
- No schema change was needed, because `games.cover_image` already existed from v6.

### v0.6, 2026-09-25: placeholder artwork (product owner request: "dummy image for games & GM profile image")
- **Demo games get cover art and demo GMs get portraits.**
  - The images are original SVG illustrations generated by `scripts/build-placeholders.mjs`, following the manifest in `src/lib/placeholders.ts`. They are stored in `web/public/images/{covers,gms}`.
  - No stock photos or external hosts are used: the CSP only allows `'self'` images, and no licence is needed.
- **Schema v6** adds the `games.cover_image` and `users.avatar_image` columns. `''` means use the generated gradient or initials fallback.
  - Migration v6 back-fills art **only** for the known demo slugs and emails.
  - Games created by GMs keep the gradient until uploads exist (IMPROVEMENTS P3-2).
- **Players have no portraits**, only initials, because the request was for GM images only.

### v0.5, 2026-09-25: hardening (engineering, approved by the product owner: "yes please")
- **Archiving a game cancels its future sessions**, releasing seats with `cancelled_by='gm'`, rather than stranding players on a hidden page.
- A GM **cannot lower seats below the players already booked** in an upcoming session.
- **Rate limits** exist; see `web/src/lib/rate-limit.ts` for the numbers. Set `QUESTBOARD_RATE_LIMIT=off` to disable locally.
- **Migrations replace reset-on-bump.** Production (`next start`) refuses to reset; development may still back up and reset when no migration path exists.

### v0.4, 2026-09-24
- **English is the default UI language for everyone.**
  - Browser `Accept-Language` is deliberately ignored. Bahasa Indonesia applies only after the visitor picks ID in the EN | ID switcher, which sets the `qb_lang` cookie for 1 year.
  - EN is listed first.
  - This supersedes v0.2's "Indonesian default".
- **The GM profile has "Location", not "Timezone".**
  - The value is a city ("Jakarta", "Bandung") or `"Online"` for online-only GMs. `normalizeLocation()` turns an empty value or any casing of "online" into `"Online"`.
  - It is informational only. Session times use the GM's browser clock, so nothing needs timezone data.

### v0.3, 2026-09-24
- **D&D is split by edition:** `D&D 5e (2014)` and `D&D 5.5e (2024)`. Never offer a bare "D&D 5e".
- **Icons are Flaticon UIcons**, from the official npm package `@flaticon/flaticon-uicons`.
  - They are subset to only the glyphs in use, about 6.5 KB.
  - The footer credit "Uicons by Flaticon" is required by the free license. Removing it needs a Flaticon Premium subscription.

### v0.2, 2026-09-24
- **No monetisation on the platform.**
  - There is no checkout, fee, refund or payout logic.
  - A booking is a free seat reservation. The GM keeps 100%, and players pay the GM directly (bank transfer, e-wallet, QRIS).
  - GMs write free-text payment details, which are shown only to players who have booked. Refunds are settled between the player and the GM.
- **Currency is IDR only**, stored as whole Rupiah integers (`price_idr`) and displayed as `Rp 75.000`. The market is Indonesia only.
- **Bilingual UI** in English and Bahasa Indonesia. User-generated content is never translated. Each game declares its **play language** (`id` / `en` / `both`).

### v0.1, 2026-09-24
- Built as a StartPlaying.games-style remake with an **original brand, "Quest Board"**. It is not affiliated with StartPlaying: never copy their name, logo, copy or assets.
- The stack was chosen for zero native dependencies on Windows: Node's built-in `node:sqlite`, custom auth, no ORM.

## Things that look like bugs but are intentional
- A game's **play language defaults to `id`**, even though the **UI** defaults to English. These are two separate concepts.
- **Players can cancel any time before start with no penalty.** Refunds are handled off-platform.
- `bookings.price_idr` is a snapshot of the price at reservation time, used only for the GM's "expected income". It is **not** a payment record.
- **Pre-v4 databases can't be migrated** (there were no migrations before v5). In development they are backed up (`*.v<N>.bak`) and re-seeded. In production the app refuses to start unless `QUESTBOARD_ALLOW_RESET=true` is set.
- Server actions return `values` (the echoed form input) on error. **This is required**, not redundant: React 19 clears forms after an action.

## Open questions for the product owner
- Should in-person venue addresses stay chat-only, or become a structured field?
- Should GMs be able to mark seats as "paid"? This is on the roadmap as a GM-only toggle.
- What are the SEO priorities, given that English is the default? (See ADR-7 in `docs/04-technical-architecture.md`.)
- Who will do the native-speaker review of the Indonesian copy?

## Environment notes (this machine)
- Windows 11. The Bash tool is Git Bash. **Python is not installed**; use Node scripts instead.
- Complex inline heredocs sometimes break quoting. Write a `.cjs` script to the scratchpad and run it instead.
- To stop a background server by port, use PowerShell: `Get-NetTCPConnection -LocalPort 3200 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.
- Playwright uses the **installed Microsoft Edge** (`channel: "msedge"`), so no browser download is needed.
