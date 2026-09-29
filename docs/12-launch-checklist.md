# 12 · Launch checklist

The code is launch-ready (see IMPROVEMENTS.md, "Launch ·" rows). What's left needs decisions or accounts only the product owner can provide. Work top to bottom; details are in [11-operations-and-deployment.md](11-operations-and-deployment.md).

## Before launch: decisions and accounts

- [ ] **Legal pages.** Read Terms and Privacy (`/terms`, `/privacy`) in both languages. Ideally a lawyer checks them against UU PDP 27/2022. Then set `QUESTBOARD_LEGAL_FINAL=true`. Also update `LEGAL_VERSION` in `web/src/lib/legal.ts` (for example to the approval date), so new sign-ups record which version they agreed to.
- [ ] **Contact email** for questions and data requests (UU PDP expects one): set `QUESTBOARD_CONTACT_EMAIL`.
- [ ] **Domain**, e.g. `questboard.id`. Set `QUESTBOARD_BASE_URL=https://…`.
- [ ] **Hosting:** one small server with a persistent disk, close to Indonesia (Jakarta or Singapore), behind a reverse proxy with HTTPS (Caddy is simplest). Set `QUESTBOARD_ENFORCE_HTTPS=true` and `QUESTBOARD_PROXY_HOPS` to match. Let the proxy compress responses (Caddy: `encode zstd gzip`) and set `compress: false` in `web/next.config.ts`: Next's own gzip logs harmless `MaxListenersExceededWarning … Gzip` warnings while streaming large pages (seen in every e2e run).
- [ ] **Email:** a Resend account with your domain verified. Set `RESEND_API_KEY` and `QUESTBOARD_MAIL_FROM`.
- [ ] **Founding GMs:** 5–10 real Game Masters who list games *before* you open to players, so the first visitors find tables.

- [ ] **Load test the real server** before opening it: `npm run load-test -- --base https://<staging> --users 40 --seconds 60` against a copy with demo data and `QUESTBOARD_RATE_LIMIT=off` (never the live database). Expect 0 errors and 0 overbooked sessions; compare p95 with TESTING.md.

## Launch day

- [ ] Deploy with `QUESTBOARD_SEED=false`. **Never** set `QUESTBOARD_DEV_OUTBOX`, `QUESTBOARD_ALLOW_RESET`, `QUESTBOARD_INSECURE_COOKIES` or `QUESTBOARD_RATE_LIMIT=off` in production.
- [ ] Start the app once, then create your admin: `npm run admin -- create you@example.com "Your Name"`. Log in, change the one-time password, and turn on **two-step login** in Settings (keep your phone's authenticator app; a lost phone is reset with `npm run admin -- reset-2fa <email>`).
- [ ] Set `QUESTBOARD_CRON_SECRET` and schedule `/api/cron/reminders` every 5 minutes.
- [ ] Schedule `npm run db:backup` nightly and copy `data/backups` off the server (it includes `uploads/`, the pictures people uploaded). **Test one restore on a copy** (rehearsed on 2026-09-28: a v25 backup restored onto an empty "new server", pictures put back, and the app upgraded it to v26 on start with every user, game and booking intact).
- [ ] Keep `data/` (the database **and** `data/uploads`, or `QUESTBOARD_UPLOAD_DIR`) on the persistent disk.
- [ ] Smoke test on the live site: sign up, verify email (a real email arrives), become a GM, list a game, book it from a second account, check the reminder and chat, then report something and handle it in `/admin`.
- [ ] Submit `https://<domain>/sitemap.xml` in Google Search Console.

## First weeks

- [ ] Check `/admin/reports` daily. Verify GMs you trust (`/admin/gms`).
- [ ] Watch the server logs for errors. Add error monitoring (e.g. Sentry) once there is traffic.
- [ ] Collect feedback from the founding GMs and first players; the next backlog comes from them.
