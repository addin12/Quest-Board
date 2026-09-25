# IMPROVEMENTS: reviewed backlog

This comes from a code and product review on 2026-09-25 (v0.4). Items are ordered by priority. **P1** = fix before real users, **P2** = next iteration, **P3** = later. Effort: S ≤ ½ day, M ≈ 1–2 days, L ≈ 3+ days.

When you finish an item, move it to **Done** with the date and a test reference. Don't start P2/P3 work without the product owner's go-ahead. P1 bugs are fair game.

## P1: Correctness & security
All P1 items are done (2026-09-25). See **Done** below. New P1s go here.

## P2: Product & UX
- **P2-1 · Legal pages (M):** Terms and Privacy (UU PDP 27/2022), in both languages, linked in the footer and at sign-up.
- **P2-2 · Account basics (M):** password reset, email verification, and self-serve account deletion that anonymises reviews.
- **P2-3 · GM "paid ✓" marker (S):** a per-seat toggle on the roster, GM-only. Add a `bookings.paid_marked_at` column.
- **P2-5 · Browse pagination (S):** `searchGames` is capped at 60 (`queries.ts:63`). Add `?page=` with a "Load more" link.
- **P2-6 · Waitlist (M):** when a session is full, let players join a waitlist. When a seat frees up, auto-offer it to the first person, who gets 12 h to confirm.
- **P2-7 · Location search (S):** include `gm_profiles.location` in the keyword search, and add a city filter for in-person games.
- **P2-9 · Recurring sessions (M):** "repeat weekly × N" when scheduling campaign sessions.
- **P2-11 · Report & admin console (L):** report a listing, review, message or payment details, with an admin queue for verifying GMs and hiding content.
- **P2-12 · Notifications (L):** in-app notifications are done (v0.9.1). Still to do: email and WhatsApp delivery, plus reminders 24 h and 1 h before a session, in the user's language. Needs a provider and a `users.locale` column.

## P2: Platform & quality
- **P2-16 · No-literal-strings lint (S):** a custom ESLint rule, or `eslint-plugin-i18next` adapted to `t()`, to stop hard-coded JSX text.
- **P2-17 · SEO basics (S):** `app/sitemap.ts`, `app/robots.ts`, canonical URLs and per-game structured data (`Event`).
- **P2-18 · Native-speaker review (S):** have a native speaker review all `id` strings in `dict.ts`. Terminology was decided by the product owner (native speaker) in v0.9.2 and is in DESIGN.md. Still to do: a line-by-line read of the remaining strings by the product owner.

## P3: Later
- **P3-1 · Postgres (L):** Neon or Supabase in the Singapore region. Swap `db.ts`, rewrite `strftime`, and replace `BEGIN IMMEDIATE` with `SELECT … FOR UPDATE`.
- **P3-2 · Image uploads (M):** R2/S3 storage with moderation for game covers and GM portraits. The columns, rendering and a library cover picker exist since v0.6/v0.7; only the upload flow and storage are missing.
  - Uploaded files must pass the same allow-list idea: server-generated paths only.
  - The GM portrait picker (library avatars) is done (v0.8).
- **P3-3 · URL-prefixed locales (M):** `/en` and `/id` with `hreflang`, if SEO for Indonesian queries matters (ADR-7).
- **P3-4 · Caching (M):** `"use cache"` for public read models. The cache key must include the language.
- **P3-5 · Discord bot (L):** invite booked players to a channel automatically.
- **P3-6 · Optional integrated payments:** only if the product owner reverses the v0.2 decision. See MEMORY.md.

## Done
Every item below was done on 2026-09-25 (v0.5). `e2e:hardening` means `web/tests/e2e/hardening.spec.ts`; `unit:hardening` means `web/tests/unit/hardening.test.ts`.

| # | Fix | Where | Test |
|---|---|---|---|
| P1-1 | Seats can't be lowered below the most seats booked in any upcoming session (`v.seatsBelowBooked`) | `saveGameAction`, `maxSeatsTakenUpcoming()` | e2e:hardening "cannot lower seats" |
| P1-2 | Archiving cancels future sessions and releases their seats (`cancelled_by='gm'`) in one transaction. The confirmation states how many players are affected | `archiveGameAction`, `upcomingSeatsTaken()` | e2e:hardening "archiving a game…" |
| P1-3 | Chat loads the **newest** 200 messages and displays them oldest-first | `listMessages()` | e2e:hardening "newest messages" (inserts 205 rows) |
| P1-4 | Sign-up and review double-submit races return friendly errors instead of a 500 (`isUniqueViolation`) | `signupAction`, `submitReviewAction` | covered by code path; manual |
| P1-5 | Translated error boundary `app/error.tsx` plus self-contained `app/global-error.tsx` (Next 16 `retry` prop) | `src/app/` | typecheck/build; manual |
| P1-6 | LIKE search escapes `% _ \` with `ESCAPE '\'` | `escapeLike()`, `searchGames()` | unit:hardening + e2e:hardening |
| P1-7 | GM page title translated (`profile.metaTitle`); "→" arrows replaced by `<Icon name="arrow-right" />` | `gms/[id]`, `page.tsx`, `dict.ts` | typecheck |
| P1-8 | **Real migrations**: `lib/migrations.ts` with ordered steps and a pure planner. Reset is dev-only; production refuses to wipe data. First migration: v5 | `db.ts → prepareSchema()` | unit:hardening (planner + a real v4→v5 run); your local DB migrated with its data kept |
| P1-9 | Fixed-window rate limits: login 10 per 10 min per IP+email, sign-up 10/h per IP, chat 30 per 10 min, reserve 30 per 10 min, review 10/h (`err.rateLimited`) | `lib/rate-limit.ts`, `fixedWindow()` | unit:hardening + e2e:hardening "rate limited" |
| P1-10 | Expired sessions purged on login; session rotated when a player becomes a GM; "Log out on all devices" button on the dashboard | `auth.ts`, `logoutEverywhereAction` | e2e:hardening "log out on all devices" |
| P1-11 | Security headers: CSP (no-nonce variant from the Next guide), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`. HSTS + upgrade-insecure-requests when `QUESTBOARD_ENFORCE_HTTPS=true` | `next.config.ts` | e2e:hardening "security headers" |
| P1-12 | Anti-scam note under the GM's payment details | game page, `game.scamWarning` | e2e:hardening "anti-scam" |
| P2-4 · Live chat | `<AutoRefresh>` runs `router.refresh()` every 20 s while the tab is visible (table chat and request thread); half-typed messages survive | `auto-refresh.tsx` | e2e: "table chat updates live" |
| P2-10 · Share + link previews | WhatsApp / copy link / native share on games and GM profiles; tavern OG images (`opengraph-image.tsx`) for the site and each game; `metadataBase` from the request or `QUESTBOARD_BASE_URL`. Instagram has no web share URL, so the native share sheet covers it on phones | `share-buttons.tsx`, `lib/og-card.tsx`, `lib/site.ts` | e2e: share + OG PNG |
| New · Add to calendar | Google Calendar link and `/api/sessions/{id}/ics` (RFC 5545, 1 h reminder, public details only) on booked sessions, My games and the booking confirmation | `lib/calendar.ts`, `calendar-links.tsx`, ics route | unit: calendar ×6; e2e ×3 |
| P2-13 · Git | Repo at `Quest Board/` (branch `main`), root `.gitignore` (DBs, build, test output, env), `.gitattributes` (LF) | `.gitignore`, `.gitattributes` | a clean clone installs, typechecks, lints, passes unit tests and builds |
| P2-14 · CI | GitHub Actions: `npm ci` → typecheck → lint → unit → build + e2e (bundled Chromium; traces uploaded on failure). `typecheck` now runs `next typegen` first, so it works on a fresh checkout | `.github/workflows/ci.yml`, `playwright.config.ts`, `package.json` | verified in a clean clone |
| P2-8 · Mobile tab bar | Bottom tab bar below `sm`; the signed-in header no longer overflows at 320–390 px | `mobile-tab-bar.tsx`, `layout.tsx` | manual width check at 320/360/390 (EN+ID); axe sweep |
| P2-15 · Accessibility automation | axe WCAG 2.1 A/AA sweep of public pages (EN/ID × light/dark) and signed-in pages and forms; form errors linked via `errAttrs`; contrast fixes | `tests/e2e/a11y.spec.ts`, `ui.tsx` `errAttrs`, `globals.css` | e2e: a11y ×5 |
| v0.9.1 · In-app notifications | Bell + `/notifications` for hire-flow and booking events (schema v8) | `lib/notifications.ts`, `notification-bell.tsx`, actions | e2e: hire flow (offer, chosen, message) + "notifications: bookings…" |
| v0.9.1 · QC fixes | Matched requests can't be closed; double choose/close is a no-op; offers need a finished GM profile; GM bio ≥ 30 in settings; idle systems get browse pages | `actions.ts`, request page, `systemFromSlug` | e2e: hire flow, "GM can't blank the bio" |
| v0.9 · Profile settings | `/settings`: name, bio, language, portrait (players too), password change (rotates the session), log out everywhere | `settings/page.tsx`, `settings-forms.tsx`, `updateProfileAction`, `changePasswordAction` | unit: categories (`parseProfile`); e2e: hire-and-browse "settings" ×2, hardening P1-10 |
| v0.9 · Browse by category | `/browse` hub and `/browse/{genre\|style\|system}/{value}`; genre and style chips on games (max 3); `/games` filters | `lib/categories.ts`, `categorySummary()`, `game-form.tsx` `CategoryChips`, migration 7 | unit: categories; e2e: "browse hub", "/games can filter", "genres are capped" |
| v0.9 · Hire a GM | `/hire-a-gm` directory and landing page; request → offers → choose → private thread with payment details for the requester only; GM inbox `/gm/requests` | `hire-a-gm/**`, `gm/requests`, `searchGms()`, request actions | e2e: "hire-a-GM directory", "hire flow" (including a 404 for strangers) |
| v0.8 · Portrait picker | GMs pick one of 12 library portraits (or initials) with a live preview; server-side allow-list (`isAllowedPortrait`); shared `ImageChoiceGrid` component | `become-gm-form.tsx`, `image-choice.tsx`, `becomeGmAction`, `placeholders.ts` | unit: placeholders (portrait files + allow-list); e2e: marketplace "illustrated portrait" |
| v0.7 · Cover picker | GMs pick library cover art (or a gradient) in the game form; server-side allow-list (`isAllowedCover`) | `game-form.tsx` `CoverPicker`, `saveGameAction`, `placeholders.ts` | unit: placeholders (allow-list + files); e2e: marketplace "pick a cover illustration" |
| P1-13 (found while fixing) | **Forms lost everything typed after an error.** React 19 resets forms after an action, so a failed login cleared the email and a GM's new-game form was wiped by one validation error. Actions now echo the submitted values (`withEcho`, never passwords), and forms use them as defaults | `actions.ts`, all `*-form.tsx` | e2e:hardening "forms keep what the user typed" |

