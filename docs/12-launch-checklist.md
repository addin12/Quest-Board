# 12 · Launch checklist

The code is launch-ready (see IMPROVEMENTS.md, "Launch ·" rows). What's left needs decisions or accounts only the product owner can provide. Work top to bottom; details are in [11-operations-and-deployment.md](11-operations-and-deployment.md).

## Before launch: decisions and accounts

The deployment kit in [`deploy/`](../deploy/README.md) (Docker: the app, a scheduler for the 5-minute job and nightly backups, and Caddy for HTTPS) turns most of this list into filling in `deploy/.env`. **Admin → Setup** then checks the settings for you. Try it on your own computer first with `npm run rehearsal` (in `web/`, needs Docker).


- [ ] **Legal pages.** Read Terms and Privacy (`/terms`, `/privacy`) in both languages. Ideally a lawyer checks them against UU PDP 27/2022. Then set `QUESTBOARD_LEGAL_FINAL=true`. Also update `LEGAL_VERSION` in `web/src/lib/legal.ts` (for example to the approval date), so new sign-ups record which version they agreed to.
- [ ] **Contact email** for questions and data requests (UU PDP expects one): set `QUESTBOARD_CONTACT_EMAIL`.
- [ ] **Domain**, e.g. `questboard.id`. Set `QUESTBOARD_BASE_URL=https://…`.
- [ ] **Hosting:** one small server with a persistent disk, close to Indonesia (Jakarta or Singapore), behind a reverse proxy with HTTPS (Caddy is simplest). **Free:** Oracle Cloud's Always Free ARM server, step by step in [`deploy/ORACLE-FREE.md`](../deploy/ORACLE-FREE.md); on a 1 GB server use the ready-made image (`QUESTBOARD_IMAGE`, `deploy/README.md` "Small servers"). Set `QUESTBOARD_ENFORCE_HTTPS=true` and `QUESTBOARD_PROXY_HOPS` to match. Let the proxy compress responses (Caddy: `encode zstd gzip`) and set `compress: false` in `web/next.config.ts`: Next's own gzip logs harmless `MaxListenersExceededWarning … Gzip` warnings while streaming large pages (seen in every e2e run).
- [ ] **Email:** Resend **and** Brevo with your domain verified, including the **SPF, DKIM and DMARC** DNS records — step by step in [`deploy/EMAIL-DNS.md`](../deploy/EMAIL-DNS.md); without them, confirmation emails land in spam. Set `RESEND_API_KEY`, `BREVO_API_KEY` and `QUESTBOARD_MAIL_FROM` (two free plans: about 400 emails a day, and one takes over when the other is down).
- [ ] **Bounce and spam webhooks** for both providers (`deploy/EMAIL-DNS.md` step 6): `RESEND_WEBHOOK_SECRET` and `QUESTBOARD_BREVO_WEBHOOK_TOKEN`. Without them, mail to dead addresses goes unseen until a provider suspends the account.
- [ ] **Founding GMs:** 5–10 real Game Masters who list games *before* you open to players, so the first visitors find tables.

- [ ] **Load test** (done in CI on every push: `npm run load-rehearsal`, 100 virtual users on the deployment kit with its memory caps — see TESTING.md for the numbers). For extra certainty on the real server, run `npm run load-test -- --base https://<staging> --users 40 --seconds 60` against a copy with demo data and `QUESTBOARD_RATE_LIMIT=off` (never the live database). Expect 0 errors and 0 overbooked sessions.

## Launch day

- [ ] Deploy with `QUESTBOARD_SEED=false`. **Never** set `QUESTBOARD_DEV_OUTBOX`, `QUESTBOARD_ALLOW_RESET`, `QUESTBOARD_INSECURE_COOKIES`, `QUESTBOARD_ADMIN_TWO_STEP` or `QUESTBOARD_RATE_LIMIT=off` in production.
- [ ] Point an uptime monitor (e.g. UptimeRobot, free) at `https://<your domain>/api/health?full=1` every 5 minutes, alerting you by email or WhatsApp: it fails when the site is down, the database is wrong, the cron has stopped for 30 minutes, or emails are stuck. The container health check keeps using `/api/health`.
- [ ] Start the app once, then create your admin: `npm run admin -- create you@example.com "Your Name"`. Log in, change the one-time password, and turn on **two-step login** (the admin console requires it) in Settings (keep your phone's authenticator app; a lost phone is reset with `npm run admin -- reset-2fa <email>`).
- [ ] Open **Admin → Setup** on the live site: every line should say OK (the scheduled job and backup turn OK after their first run).
- [ ] Set `QUESTBOARD_CRON_SECRET` (the kit's scheduler calls `/api/cron/reminders` every 5 minutes; without the kit, schedule it yourself).
- [ ] Backups: the kit's scheduler runs `npm run db:backup` nightly and copies it off the server (off-site, below); without the kit, schedule it and copy `data/backups` off the server (it includes `uploads/`, the pictures people uploaded). **Test one restore on a copy** (rehearsed on 2026-09-28: a v25 backup restored onto an empty "new server", pictures put back, and the app upgraded it to v26 on start with every user, game and booking intact).
- [ ] Keep `data/` (the database **and** `data/uploads`, or `QUESTBOARD_UPLOAD_DIR`) on the persistent disk.
- [ ] Set up **off-site backups** (Cloudflare R2 or Backblaze B2, `QUESTBOARD_OFFSITE_*` — `deploy/README.md`, "Off-site backups") and make the first copy with `npm run db:offsite`; Admin → Setup should show it OK.
- [ ] Smoke test on the live site: sign up, verify email (a real email arrives), become a GM, list a game, book it from a second account, check the reminder and chat, then report something and handle it in `/admin`.
- [ ] Submit `https://<domain>/sitemap.xml` in Google Search Console.

## First weeks

- [ ] **Updates:** `sh deploy/update.sh` (it goes back by itself if the new version isn't healthy). Dependabot opens update pull requests every Monday; merge the green ones, then update the server.
- [ ] Check `/admin/reports` daily. Verify GMs you trust (`/admin/gms`).
- [ ] Watch the server logs for errors. Add error monitoring (e.g. Sentry) once there is traffic.
- [ ] Collect feedback from the founding GMs and first players; the next backlog comes from them.
