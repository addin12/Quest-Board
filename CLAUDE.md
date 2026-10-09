# Quest Board: agent guide

Quest Board is a bilingual (English default / Bahasa Indonesia) board where players in **Indonesia** find tabletop RPG games and reserve seats with Game Masters.

- **No payments and 0% commission.** Players pay GMs directly.
- Prices are in whole Rupiah.
- The app is a Next.js 16 + SQLite MVP in `web/`. Product and engineering specs for humans are in `docs/`.

## Always-loaded context
@MEMORY.md
@CONVENTIONS.md

## Read before you work on…
| Task | Read |
|---|---|
| Anything structural: new route, table, action, data flow | [ARCHITECTURE.md](ARCHITECTURE.md), then [DECISIONS.md](DECISIONS.md) for why things are the way they are |
| UI, copy, icons, colours, layout, accessibility | [DESIGN.md](DESIGN.md) |
| Writing or running tests, verifying a change, screenshots | [TESTING.md](TESTING.md) |
| "What should we improve next?" / picking up backlog work | [IMPROVEMENTS.md](IMPROVEMENTS.md) |
| Next.js APIs of any kind | `web/AGENTS.md`, which points at the version-matched docs in `web/node_modules/next/dist/docs/` |
| Product rules in depth (roles, reservations, visibility) | `docs/03-functional-spec.md` |
| HTTP endpoints | `docs/api-reference.md` (generated: `npm run docs:api`) |
| Running the server: deploy, roll back, restore, incidents | `deploy/README.md`, `docs/runbooks.md` |

## Commands (run in `web/`)
```bash
npm run dev          # http://localhost:3000 — DB auto-created + seeded at web/data/questboard.db
npm run typecheck    # tsc; also fails on missing/unknown translation keys and icon names
npm run lint
npm test             # node:test unit suite (tests/unit)
npm run test:e2e     # next build + Playwright (tests/e2e) on :3100 with a fresh data/e2e.db
npm run icons        # regenerate the Flaticon icon subset after editing src/lib/icons.ts
npm run placeholders # regenerate demo cover art + GM portraits (public/images) from src/lib/placeholders.ts
npm run i18n:client-keys # after adding t("…") in client code (a unit test fails when it's stale)
npm run docs:api     # regenerate docs/api-reference.md after changing an API route (a unit test checks it)
npm run analyze      # what's in the browser bundles (next experimental-analyze)
npm run db:reset     # delete local DB; re-seeded on next request
```
Demo logins all use `tavern-demo-42`: `player@questboard.test`, `gm@questboard.test`, `admin@questboard.test`.

## Definition of done
Before saying a change is finished, all of these must be green:
1. `npm run typecheck && npm run lint && npm test`
2. `npm run test:e2e` for anything user-facing, **when the owner says to run it** (see the commit rule in memory: until then, write the e2e tests but don't run them, and say so).
3. UI changes look right in **both languages** and **both themes**: take a screenshot (see TESTING.md).
4. New UI strings are added to **both** `src/lib/i18n/en.ts` and `id.ts`.
5. `docs/` and `MEMORY.md` are updated if behaviour or a product decision changed; a new key decision gets a line in DECISIONS.md.

## Hard rules
- **Never add payments, checkout, fees or commission** unless the user explicitly asks. See MEMORY.md.
- **Never expose `gm_profiles.payment_info`** outside the members-only card on the game page. It must never appear in the API, search results or public profiles.
- **Never hard-code UI text.** Use `t("key")`.
- **Keep the footer credit "Uicons by Flaticon".** The icon license requires it.
- **Schema changes ship as migrations** (`web/src/lib/migrations.ts`). Never add a change that needs a reset; production refuses to reset.
- Form actions go through `withEcho()`, and abuse-prone ones through `hit()`. See CONVENTIONS.md.

## Engineering rules
The owner's rule files (`D:\TTRPG\.claude\rules`, 10 files) combined into one list, without repeats, and written for this
project: each rule says how it is done here. "Checked by" names the test that fails when the rule is broken.

### How to work
- **Match the project's conventions before adding a pattern** (CONVENTIONS.md). Small, focused files and functions; small, focused components.
- **Minimal diffs, not rewrites.** Explain a risky change (data, auth, deploy, anything hard to undo) before making it.
- **Production-ready only:** strongly typed, no placeholder logic. *Checked by* `tests/unit/rules.test.ts` (no TODO/FIXME/XXX in `src/` or `scripts/`).
- **Explicit names** for modules, actions and handlers (`markPaidAction`, `playerCancelledEmail`).
- **Comments say why, not what**, and every non-obvious trade-off is written down where it's made (and in DECISIONS.md when it's a project-wide choice).
- **Readability first, then measure, then optimise:** profile or benchmark before and after every optimisation and put the numbers in the commit or IMPROVEMENTS.md. No premature optimisation.

### Inputs, errors and side effects
- **All external input is untrusted:** form fields, query strings, route params, webhooks, uploads. Validate shape, type and range at the boundary (`lib/validation.ts`, `parseGame`, `parseReport`, `read-body.ts` size limits); return translation keys, never raw errors.
- **Fail safely with a clear message** (`err.*` keys for people, `[quest-board] …` log lines for the operator). Never leak secrets, tokens or stack traces in responses or logs (`redactPath`, the outbox blanks one-time links).
- **Side effects are isolated and observable:** emails go through the outbox (`email_outbox`), notifications through `notify()`, errors to `error_log`, moderator actions to `admin_log`, security events to `security_events`.
- **Retries only where repeating is safe.** Email retries send an `Idempotency-Key` to Resend. Brevo has none, so an optional email whose Brevo call timed out isn't retried (an important one is: a second sign-up email beats none).
- **Timeouts on every external call** (`AbortSignal.timeout`: email 8 s, scheduler 15–120 s, off-site 300 s). **Circuit breaker:** an email provider that failed 3 times in a row is skipped for 5 minutes (`lib/circuit-breaker.ts`).
- **Configuration is centralised:** every setting is in `deploy/.env.example` with a comment. *Checked by* `settings-documented.test.ts`.

### Next.js and React
- **Server Components by default;** `"use client"` only for interactivity (menus, live chat, copy buttons). Data is fetched on the server.
- **Mutations are server actions** used with `useActionState` (React 19's name for `useFormState`), and every form works without JavaScript.
- **No manual loading/error state:** pending state comes from `useFormStatus` (`SubmitButton`), errors from the action's returned keys.
- **Optimistic updates for toggles:** save, follow, "I've sent the payment" and "Mark paid" show their new state the moment they're tapped (`ToggleSubmit`, reading the submitted form from `useFormStatus`, so the form still works without JavaScript).
- **URL state for anything shareable:** filters, sort, search and pages live in `searchParams`.
- **No prop drilling beyond 2 levels:** use context (`I18nProvider`) or pass translated strings.
- **Fonts through `next/font`** (self-hosted, no layout shift).
- **JSON-LD on every public content page:** home (WebSite + Organization), game lists (CollectionPage), game pages (Event + BreadcrumbList), GM profiles (ProfilePage), How it works and Become a GM (WebPage), Hire a GM (FAQPage). Builders in `lib/seo.ts`. *Checked by* `seo.test.ts`.
- **Core Web Vitals from real visitors:** `components/web-vitals.tsx` sends LCP, INP and CLS to `/api/vitals`; the admin Errors page shows the 75th percentile per page for the last 7 days.

### Performance
- **Cache at the nearest layer:** browser (`Cache-Control` on static files, share pictures, calendar feeds) → Caddy (compression, HTTP/2 and HTTP/3) → app (in-memory caches such as `lib/og-cache.ts`) → database.
- **Coalesce concurrent work:** a cache that misses shares one in-flight computation (no stampede). *Checked by* `og-cache.test.ts`.
- **Paginate every list** (20–50 per page by default; the API's `limit` defaults to 30, at most 100) and never render 1000+ items at once; long lists page instead of virtualising.
- **Never load a whole table into memory**; queries that can grow have a `LIMIT`. Exports and feeds are one person's own data (their calendar feed at most 1000 sessions), never a whole table.
- **Code splitting is per route (Next does it).** Don't lazy-load anything the first tap depends on: it caused the lost-tap bug on iPhones (DECISIONS.md, P2-19). Lazy-load only below-the-fold extras, and images below the fold get `loading="lazy"`.
- **Named imports only** (tree-shaking). Check bundle changes with `npm run analyze` and the phone budgets (`phone-budget.spec.ts`).
- **CSS animations over JS animations; batch DOM reads and writes; debounce live inputs by 300 ms** (search today submits a form, so nothing to debounce).
- **`useMemo` only after profiling** (React DevTools Profiler).
- **Load-test before shipping a major feature:** `npm run load-test` / `npm run load-rehearsal` (CI's load job keeps the trend).

### Database (SQLite)
- **Index every column used in a `WHERE` or `JOIN`,** foreign keys included. *Checked by* `rules.test.ts` (every foreign key has an index).
- **No N+1 queries:** one query with a `JOIN` or a subquery, never a query per row in a loop.
- **When a query is slow:** `EXPLAIN QUERY PLAN` it, add or reshape an index (a partial index for a filtered query), and measure before/after.
- **One connection, reused** (`db()`), in WAL mode; capacity checks inside `tx()` (`BEGIN IMMEDIATE`).
- **Right types:** whole Rupiah as `INTEGER`, times as ISO-8601 UTC `TEXT`, flags as `INTEGER` 0/1, `CHECK` constraints for enums.

### Security
- **Sessions:** server-side opaque tokens (only the hash is stored), 30 days sliding, **90 days at most** (then log in again), a fresh token at login, role change, password change and two-step on/off; "Log out everywhere" and `admin -- end-sessions` revoke them.
- **Constant-time comparison** (`timingSafeEqual`) for every secret: passwords, two-step codes, webhook signatures, the cron secret, unsubscribe links, the calendar feed link. Tokens looked up in the database are stored as SHA-256 hashes.
- **Content Security Policy** with a per-request nonce (`src/proxy.ts`); violations land in the error log through `/api/csp-report`. Review it when adding a script, style or host.
- **Dependency audit:** `npm audit` on every push (CI fails on high), the daily security watch (`security-watch.yml`) and weekly Dependabot.
- **Security events go to an append-only log** (`security_events`): failed logins, wrong two-step codes, password and email changes, two-step on/off, "log out everywhere", refused admin access. The database refuses to change or delete a row until it is 180 days old.
- **Secrets live only in `deploy/.env` on the server** (never committed, mode 600, read by Docker Compose); change one with deploy/README.md → "Changing a secret".
- **Threat-model before a new login or account flow:** write down who could abuse it and how (docs/10-security-trust-safety.md), then build it.

### Testing
- **Testing pyramid:** pure logic gets unit tests (`node:test`, fast); Playwright end-to-end tests cover the critical journeys (sign up, log in, book, cancel, pay the GM, moderate) in Chromium, Firefox and WebKit.
- **Every bug fix gets a regression test;** every new business rule gets a unit test for its edge cases.
- **Test through public functions,** not private details. **Inject dependencies** (clock, size limits, environment) as parameters instead of mocking: `makeOgCache(maxBytes)`, `makeBreaker({ now })`, `configuredProviders(env)`.
- **Deterministic data, stable assertions:** fixed dates and named fixtures; e2e accounts from `tests/e2e/helpers.ts` (`unique()`, `signup`, `createGmWithGame`), no magic numbers without a name.
- **Integration with the outside is tested against fakes** (`scripts/rehearsal-fakes.mjs` for Resend and S3) and the rehearsal runs the real Docker kit like a staging server.
- **A flaky test is a P1 bug.** Never commit a test that passes only sometimes; the weekly flake hunt (`flake-hunt.yml`) runs the suite repeatedly to find them.
- **Lint, typecheck and tests pass before anything is merged or pushed.**

### Docker and CI
- **Layer order for cache hits:** system packages, then `package*.json` + `npm ci` (with a BuildKit cache mount), then the code.
- **One Dockerfile, separate targets:** `dev` (hot reload) and the default production image.
- **`WORKDIR` before `COPY`; `COPY --chown`** instead of a separate `chown` step.
- **OCI labels** on the image (source, version, revision, description, licence).
- **Scan and measure before pushing:** Trivy (HIGH/CRITICAL fails the build) and dive (wasted space and efficiency) in the rehearsal job, before `image-publish`.
- **Workflows stay plain:** the standard layout (`.github/workflows/*.yml`), every non-obvious step named, no hidden defaults, actions pinned to a major version and tools to an exact one (Trivy stays on `latest` on purpose: a scanner must know the newest problems), `timeout-minutes` on every job.

### Documentation
- **README:** what it is, quick start, install, usage examples, configuration, deploying, contributing.
- **ARCHITECTURE.md** describes the system with **Mermaid diagrams** committed next to the code; **DECISIONS.md** records each key decision (context, decision, consequences).
- **API reference generated from the code:** each `route.ts` starts with a doc comment; `npm run docs:api` writes `docs/api-reference.md`. *Checked by* `api-docs.test.ts`.
- **Runbooks** for every operational task: deploy, update, roll back, restore (deploy/README.md) and incidents (docs/runbooks.md).
- **Every setting documented** in `deploy/.env.example`, with what it does.
- **Examples are documentation:** the helpers used everywhere (`formatIdr`, `parseIdr`, `escapeLike`, `formatWhen`, `redactPath`, `isGoogleMapsUrl`, `sameSecret`, `makeBreaker`, `vitalsPage`, `p75`…) carry an `@example`; add one to any new helper whose use isn't obvious. Unit tests show the rest.

### Adapted for this project (and why)
| Rule as written | What we do instead | Why |
|---|---|---|
| Stream with Suspense boundaries | No Suspense around the app or a page | A boundary turned `notFound()` 404s into 200s and broke redirects (round 34); SQLite reads are synchronous, so there is nothing to stream |
| Lazy-load routes and heavy components | Next's per-route splitting only | Waiting for a lazy chunk lost 4 in 10 first taps on iPhones (P2-19) |
| `useOptimistic` | `ToggleSubmit` with `useFormStatus` | Same instant feedback, and the forms keep working without JavaScript |
| `useQuery` / `useAction` | `useActionState` + `useFormStatus` | Server actions already give pending and error state; no client data library needed |
| `@vercel/analytics` | Own `/api/vitals` + admin view | Not hosted on Vercel; no third-party tracker (privacy, CSP) |
| k6 or Locust | `scripts/load-test.mjs` | Already measures the real flows in CI; same job, no new tool |
| Read replicas, sharding, connection pooling, Redis | One SQLite file, one connection, in-memory caches | One small server; SQLite reads take microseconds. The path to Postgres is in IMPROVEMENTS.md |
| Vault / AWS Secrets Manager / Doppler | `deploy/.env` (mode 600) | One server, one owner; a secrets service is more to run and pay for |
| Short-lived tokens with refresh rotation | Server-side sessions: sliding 30 days, 90 days at most, rotated on login and role changes | Revocable at once from Settings; a refresh-token pair adds nothing when the server holds the session |
| React Testing Library for every component; Storybook | Playwright (three browsers, axe) and the /dev/emails gallery | Components are server-rendered; testing them in a real browser covers more. Ask the owner before adding either tool |
| Stryker mutation score | Regression test per bug, review of tests | Not set up yet; ask the owner before adding it (it's slow with `node:test`) |
| Parallel and intercepting routes | Used when a screen needs them | No screen needs them yet |
| Lighthouse / DevTools | Phone budgets (`phone-budget.spec.ts`) + real-visitor vitals | Measured on every push instead of by hand |
