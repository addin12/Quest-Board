# 11 · Operations & Deployment

## 1. Local development

**A real server's settings** — every one, with what it does — are in [`deploy/.env.example`](../deploy/.env.example);
a unit test (`tests/unit/settings-documented.test.ts`) fails when the code reads a setting that isn't
listed there. The table below covers what matters on a development machine.

```bash
cd web
npm install
npm run dev            # http://localhost:3000 — DB auto-created & seeded at web/data/questboard.db
npm run db:reset       # wipe local DB (re-seeded on next request)
```

Requires **Node ≥ 22.13** (developed on 24). No database server or native build tools are needed.

> **Upgrading from v0.1:** the schema changed (USD → IDR, payments removed). On first start, the old `questboard.db` is automatically moved to `questboard.db.v1.bak` and a fresh v2 database is seeded. Nothing is deleted.

**Environment variables**

| Var | Default | Purpose |
|---|---|---|
| `QUESTBOARD_DB` | `./data/questboard.db` | SQLite file path (or `:memory:`) |
| `QUESTBOARD_SEED` | `true` | Set `false` to boot with an empty DB |
| `NODE_ENV` | set by Next | `production` enables Secure cookies |
| `PW_CHANNEL` | `msedge` | Playwright browser (`chrome`, `msedge`) |
| `QUESTBOARD_RATE_LIMIT` | on | Set `off` to disable rate limits (local debugging only) |
| `QUESTBOARD_RATE_LIMIT_OVERRIDES` | unset | Per-bucket limits, e.g. `signup=500` (e2e runs only) |
| `QUESTBOARD_ALLOW_RESET` | `false` | Lets `next start` back up and reset a DB that has no migration path. **Never set this in real production** |
| `QUESTBOARD_ENFORCE_HTTPS` | `false` | Behind TLS: adds HSTS and `upgrade-insecure-requests` |
| `RESEND_API_KEY` / `BREVO_API_KEY` + `QUESTBOARD_MAIL_FROM` | unset | Deliver emails through Resend, with Brevo taking over when Resend is down or full (daily limits `RESEND_DAILY_LIMIT` / `BREVO_DAILY_LIMIT`; `lib/mail-providers.ts`) (e.g. `Quest Board <no-reply@questboard.id>`). Unset: emails are only queued in `email_outbox` |
| `QUESTBOARD_DEV_OUTBOX` | `false` | Shows `/dev/outbox` in a production build (**e2e only**: it reveals reset links). Always off when `QUESTBOARD_ENFORCE_HTTPS=true` |
| `QUESTBOARD_CONTACT_EMAIL` | unset | Contact address shown on the Terms and Privacy pages |
| `QUESTBOARD_LEGAL_FINAL` | `false` | Set `true` once a lawyer has approved the legal texts (hides the "draft" notice) |
| `QUESTBOARD_BASE_URL` | request host | Public origin (e.g. `https://questboard.id`) for share links, `.ics` files and Open Graph tags. **Set it in production**, or links follow the Host header (a warning is logged once) |
| `QUESTBOARD_PROXY_HOPS` | `1` | How many reverse proxies you run in front of the app (Caddy/nginx/Fly = 1; a CDN in front of nginx = 2). Rate limits use the client address that many entries from the right of `X-Forwarded-For`, so visitors can't fake their IP. **Run the app behind a proxy that sets `X-Forwarded-For`**, or all visitors share one limit |
| `QUESTBOARD_BACKUP_DIR` / `QUESTBOARD_BACKUP_KEEP` | `data/backups` / `14` | Where `npm run db:backup` writes, and how many backups it keeps |
| `QUESTBOARD_CRON_SECRET` | unset | Enables `/api/cron/reminders` (session reminders 24 h and 1 h before, sending queued notification emails and retrying failed ones (up to 3 attempts in 24 h), “leave a review” prompts, clearing expired sign-in sessions, passing expired waitlist offers to the next person, and pruning read notifications older than 180 days and outbox rows older than 30 days). Call it every 5–10 minutes with `Authorization: Bearer <secret>`, e.g. a crontab line `*/5 * * * * curl -fsS -H "Authorization: Bearer $SECRET" https://questboard.id/api/cron/reminders`. Unset: the route 404s and reminders are only checked (at most once a minute) while people browse the site |

There are **no payment or API keys** to configure.

## 2. Production build & hosting

```bash
npm run build && npm start      # :3000
```

A single stateful Node process with SQLite on a persistent disk. **Use the deployment kit**
([`deploy/README.md`](../deploy/README.md)): the app, a scheduler (the 5-minute job, nightly backups and
their off-site copies) and Caddy for HTTPS, with memory caps and a read-only file system.
- **Free:** Oracle Cloud's Always Free ARM server — [`deploy/ORACLE-FREE.md`](../deploy/ORACLE-FREE.md).
- **Cheapest paid:** a 1–2 GB VPS in Jakarta or Singapore with the ready-made image
  (`ghcr.io/addin12/quest-board`, built by CI for x86 and ARM; README "Small servers").
- **Not suitable as-is:** serverless or multi-instance hosting. Move to Postgres first (§4).

Updates: `sh deploy/update.sh` (backup, update, health check, automatic rollback). Before a database
upgrade the app keeps a copy of the database as it was (`backups/questboard-before-v…`).

## 3. Runbook

| Task | How |
|---|---|
| **First admin (launch day)** | Start the app once (it creates the database), then `node scripts/admin.mjs create you@example.com "Your Name"` (in the kit: `docker compose exec app node scripts/admin.mjs …`). It prints a one-time password: log in and change it in Settings. Production has **no** demo admin |
| More admins | `node scripts/admin.mjs promote <email>` (an existing account) · `node scripts/admin.mjs demote <email>` · `node scripts/admin.mjs list`. The last admin can't be demoted |
| Two-step login | Every admin turns it on in Settings (the admin home reminds them); GMs may too. Lost phone: `node scripts/admin.mjs reset-2fa <email>` turns it off and logs them out everywhere; they set it up again |
| Backup | `npm run db:backup` — a checked copy (`VACUUM INTO` + integrity check) that is safe while the app runs, rotated to the newest 14. Schedule it nightly, e.g. `15 2 * * * cd /app && npm run db:backup`, and copy `data/backups` off the server (object storage, another machine) |
| Restore | Stop the app → `npm run db:restore -- data/backups/questboard-<time>.db --yes` (the current database is kept as `*.before-restore-<time>.db`) → start. Test a restore on a copy before you need one |
| Verify a GM | Admin console → GMs (`/admin/gms`) |
| Remove abusive payment details | `UPDATE gm_profiles SET payment_info = '' WHERE user_id = ?;` |
| Hide a listing | `UPDATE games SET status = 'archived' WHERE slug = ?;` |
| Expire sessions | `DELETE FROM auth_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now');` |
| Update | `cd deploy && sh update.sh`: a backup, the new version, a health check; if it isn't healthy it goes back to the previous version (and the database as it was before the upgrade) by itself. By hand: `deploy/README.md`, "Rolling back an update" |
| Load rehearsal | `npm run load-rehearsal` (needs Docker): the deployment kit with demo data and 100 virtual users for 2 minutes; checks errors, overbooking and memory against the caps (also in CI) |
| Deployment kit | `deploy/` (Docker Compose: app, scheduler, Caddy) — see `deploy/README.md`; settings in `deploy/.env` from `deploy/.env.example`; **Admin → Setup** checks them. Rehearse locally with `npm run rehearsal` |
| Health check | `GET /api/health` returns `{"ok":true,"schema":N}` with 200 when the database answers at the expected schema version, and 503 otherwise — use it for the container health check (Docker: `HEALTHCHECK CMD curl -fsS http://localhost:3000/api/health || exit 1`). **Uptime monitor:** `GET /api/health?full=1` adds `cron` (last run; 503 when it hasn't run for 30 minutes) and `email` (unsent for over 30 minutes while a provider is configured); each says `"not configured"` when that part isn't set up |
| Server errors | Admin console → **Server errors** (`/admin/errors`): errors captured by `src/instrumentation.ts`, grouped, last 30 days (no cookies, headers or query strings are stored). The cron route prunes older rows. The admin home also shows this week's count. Admins also get a **daily email digest** (at most every 20 hours, only when there were errors) from the cron route |

## 4. Scaling path
1. **Postgres** (Singapore or Jakarta region):
   - Swap `lib/db.ts` for `pg` or Drizzle, with versioned migrations replacing the `user_version` backup-and-recreate behaviour.
   - `strftime` → `now()`, `AUTOINCREMENT` → `bigserial`, and `BEGIN IMMEDIATE` → `SELECT … FOR UPDATE` on the session row.
2. **Stateless instances** behind a load balancer.
3. **Caching:** `"use cache"` + `cacheTag` for public read models. The cache key must include the **language**, because rendered strings differ.
4. **Search:** Postgres full-text search with an Indonesian and English configuration, then Meilisearch or Typesense.
5. **Background jobs:** reminders (email and WhatsApp), digests.

## 5. Icons (Flaticon UIcons)
- Source: the `@flaticon/flaticon-uicons` npm package (official Flaticon UIcons). The license is free with attribution, and the footer credit must stay.
- Add or remove an icon by editing `web/src/lib/icons.ts`, then running `npm run icons`. Commit the regenerated `src/app/icons/` files.
- `npm test` fails if the registry and the generated CSS drift apart.
- Buying a Flaticon Premium subscription would remove the attribution requirement. Keep the credit unless that is purchased.

## 6. Localisation operations
- All UI strings live in `web/src/lib/i18n/dict.ts`. Add a key to `en` and to `id`. Typecheck and `npm test` fail if either side is missing or placeholders differ.
- Copy changes to Indonesian should be reviewed by a native speaker before release (see the [QA checklist](09-testing-and-qa.md#4-manual-qa-checklist-per-release)).
- The default language is **English** (`DEFAULT_LANG` in `lib/i18n/dict.ts`). Visitors switch to Indonesian with the header switcher; browser language is deliberately ignored.

## 7. Observability (phase 2)
- Structured JSON logs (request id, user id, action, **lang**, latency).
- Sentry.
- Uptime check on the health endpoint.
- Product events: `search`, `game_view`, `reserve_start`, `seat_reserved`, `seat_released`, `review_submitted`, `game_published`, `language_switched`. These feed the [PRD metrics](01-product-requirements.md#7-success-metrics).
