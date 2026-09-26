# 11 · Operations & Deployment

## 1. Local development

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
| `RESEND_API_KEY` + `QUESTBOARD_MAIL_FROM` | unset | Deliver emails through Resend (e.g. `Quest Board <no-reply@questboard.id>`). Unset: emails are only queued in `email_outbox` |
| `QUESTBOARD_DEV_OUTBOX` | `false` | Shows `/dev/outbox` in a production build (**e2e only**: it reveals reset links). Always off when `QUESTBOARD_ENFORCE_HTTPS=true` |
| `QUESTBOARD_CONTACT_EMAIL` | unset | Contact address shown on the Terms and Privacy pages |
| `QUESTBOARD_LEGAL_FINAL` | `false` | Set `true` once a lawyer has approved the legal texts (hides the "draft" notice) |
| `QUESTBOARD_BASE_URL` | request host | Public origin (e.g. `https://questboard.id`) for share links, `.ics` files and Open Graph tags. **Set it in production**, or links follow the Host header (a warning is logged once) |
| `QUESTBOARD_CRON_SECRET` | unset | Enables `/api/cron/reminders` (session reminders, 24 h and 1 h before). Call it every 5–10 minutes with `Authorization: Bearer <secret>`, e.g. a crontab line `*/5 * * * * curl -fsS -H "Authorization: Bearer $SECRET" https://questboard.id/api/cron/reminders`. Unset: the route 404s and reminders are only checked (at most once a minute) while people browse the site |

There are **no payment or API keys** to configure.

## 2. Production build & hosting

```bash
npm run build && npm start      # :3000
```

A single stateful Node process with SQLite on a persistent disk:
- **Good fits:** a small VPS or container with a volume (e.g. a VPS in Jakarta or Singapore for low latency to Indonesian users; Fly.io `sin` region with a volume; Railway or Render with a disk).
- **Not suitable as-is:** serverless or multi-instance hosting. Move to Postgres first (§4).

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build
ENV NODE_ENV=production QUESTBOARD_DB=/app/data/questboard.db QUESTBOARD_SEED=false TZ=Asia/Jakarta
VOLUME /app/data
EXPOSE 3000
CMD ["npm", "start"]
```

`TZ` doesn't affect correctness, because dates are stored in UTC and formatted per viewer. It only makes server logs read in WIB.

## 3. Runbook

| Task | How |
|---|---|
| Backup | `sqlite3 questboard.db ".backup 'backup-$(date +%F).db'"` nightly, kept 30 days off-box |
| Restore | Stop the app → replace the DB file (remove `-wal`/`-shm`) → start |
| Verify a GM | `UPDATE gm_profiles SET verified = 1 WHERE user_id = ?;` |
| Remove abusive payment details | `UPDATE gm_profiles SET payment_info = '' WHERE user_id = ?;` |
| Hide a listing | `UPDATE games SET status = 'archived' WHERE slug = ?;` |
| Make an admin | `UPDATE users SET role = 'admin' WHERE email = ?;` |
| Expire sessions | `DELETE FROM auth_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now');` |
| Health check | `GET /api/games?limit=1` returns 200 |

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
