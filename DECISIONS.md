# DECISIONS: why Quest Board is built the way it is

Each key technical decision, with its context and consequences. ADR-1 to ADR-10 (server actions, SQLite with
raw SQL, pure logic modules, UTC storage, no money handling, concurrency, language URLs, typed translation
keys, schema versioning, the icon font) are in [docs/04-technical-architecture.md](docs/04-technical-architecture.md#4-key-design-decisions-adrs).
This file continues from ADR-11. Add one when a choice affects the whole project or would surprise a newcomer.

Format: **Context** (what forced a choice), **Decision**, **Consequences** (what it costs, what to watch).

---

## ADR-11 · One server, one SQLite file (2026-09-25)
**Context.** Pre-launch, a few hundred users at first, one owner paying for hosting. A database server is
more to run, back up and pay for.
**Decision.** SQLite (`node:sqlite`, WAL) on the app's volume, one connection, nightly checked backups and an
off-site copy (R2/B2/S3). Hosting: one small VM (Oracle Always Free) behind Caddy.
**Consequences.** No read replicas, sharding or connection pool; reads take microseconds. Writes are
serialised, which suits booking seats. The path to Postgres is written down in IMPROVEMENTS.md, for when one
server isn't enough.

## ADR-12 · Server-side sessions, not JWTs (2026-09-25, updated 2026-10-09)
**Context.** Logins must be revocable at once ("log out everywhere", a stolen phone, a suspended GM).
**Decision.** An opaque token in an HttpOnly cookie; the database keeps only its SHA-256. Sliding 30 days, 90
days at most after the login, a fresh token at login, role change and two-step changes.
**Consequences.** One indexed lookup per request. No refresh-token pair is needed: the server already holds
the session and can end it.

## ADR-13 · No Suspense boundary around the app or a page (2026-10-08)
**Context.** A Suspense boundary around the app (tried for lost early taps) turned `notFound()` into a 200 page
and broke redirects. SQLite reads are synchronous, so there is nothing to stream anyway.
**Decision.** No root `loading.tsx` or Suspense; a page renders in one pass.
**Consequences.** Status codes stay right (404s, redirects). If a slow, async section ever appears, give it its
own boundary that never contains a `notFound()` or `redirect()`.

## ADR-14 · The language travels with the page, not as a lazy chunk (2026-10-09)
**Context.** On iPhones (WebKit), 4 in 10 first taps were lost while hydration waited for a dynamically imported
dictionary (IMPROVEMENTS P2-19).
**Decision.** The root layout passes the strings client code uses (`lib/i18n/client-keys.ts`, generated) as a
prop. Nothing the first tap depends on is lazy-loaded.
**Consequences.** About a quarter of the dictionary goes with each page (HTML 19–31 KB). `npm run i18n:client-keys`
after adding a client string; a unit test fails while the list is stale.

## ADR-15 · Optimistic toggles through `useFormStatus` (2026-10-09)
**Context.** Toggles (save, follow, paid) should change at once, and every form must work without JavaScript.
`useOptimistic` needs a client-side action function, which a browser without JavaScript can't submit.
**Decision.** `ToggleSubmit` / `PaidClaim` read the form being sent from `useFormStatus` and show its new state
while the server action runs.
**Consequences.** Same instant feedback; if the action fails, the page shows the real state when it refreshes.

## ADR-16 · Our own page-speed measurement, no third-party analytics (2026-10-09)
**Context.** Core Web Vitals should be watched on real phones, but the site isn't on Vercel, the CSP allows no
outside hosts, and players' privacy matters (UU PDP).
**Decision.** `useReportWebVitals` → `POST /api/vitals` → `web_vitals` (route pattern, metric, value; 30 days)
→ Admin → Errors (75th percentile per page).
**Consequences.** No cookies or accounts in the data; one small table; no dashboard beyond the admin page.

## ADR-17 · An append-only security log in the database (2026-10-09)
**Context.** After an account takeover, the owner needs to see failed logins and account changes, and the
record must not be editable by whoever got in.
**Decision.** `security_events`, with SQLite triggers refusing `UPDATE` and any `DELETE` before 180 days.
**Consequences.** Even an admin can't tidy it (only the retention cron removes old rows). Someone with shell
access to the server can still drop the table: the off-site backups keep earlier copies.

## ADR-18 · Email: two providers, an outbox, idempotency and a circuit breaker (2026-10-01, updated 2026-10-09)
**Context.** Free plans allow 100 (Resend) + 300 (Brevo) emails a day; providers go down; a timeout leaves the
outcome unknown.
**Decision.** Every email is written to `email_outbox` first, then sent through the first provider with room.
Resend gets an `Idempotency-Key` per outbox row; Brevo has none, so an optional email that timed out there isn't
retried. A provider failing 3 times in a row is skipped for 5 minutes.
**Consequences.** Important emails (sign-up, password) may very rarely arrive twice through Brevo; optional
ones never do. During an outage requests don't wait 8 s per email.

## ADR-19 · Generic rules adapted, not copied (2026-10-09)
**Context.** The owner's engineering rules (`D:\TTRPG\.claude\rules`) are written for any project; some assume
tools or scale Quest Board doesn't have (Redis, read replicas, Vault, Storybook, k6, `@vercel/analytics`).
**Decision.** CLAUDE.md → "Engineering rules" states each rule as it applies here, and a table lists the ones
adapted with the reason. Tools that would add cost or dependencies (Storybook, React Testing Library, Stryker)
wait for the owner's go-ahead.
**Consequences.** The rules stay checkable: `tests/unit/rules.test.ts` fails on the ones a test can see.
