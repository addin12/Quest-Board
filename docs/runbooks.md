# Runbooks: when something goes wrong

Everyday operations (first start, updates, rolling back, restoring a backup, changing a secret) are in
[deploy/README.md](../deploy/README.md); admin tasks (admins, two-step resets, verifying GMs) are in
[11-operations-and-deployment.md](11-operations-and-deployment.md#3-runbook). This page is for incidents.

All commands run on the server in `Quest-Board/deploy`.

## Any incident: the first five minutes
1. **Look:** `docker compose ps` (is everything `healthy`?), `curl -s https://<domain>/api/health?full=1`
   (database, cron, email), Admin → Errors (new server errors, page speed) and Admin → Setup.
2. **Logs:** `docker compose logs --since 30m app` (and `scheduler`, `caddy`).
3. **Contain** with the matching section below. Prefer a rollback (`sh update.sh` rolls back by itself; by hand:
   deploy/README.md → "Rolling back an update by hand") over a fix under pressure.
4. **Tell people** if players are affected: a pinned post where the community gathers (Discord/WhatsApp).
5. **Afterwards:** write what happened, why, and what changes, as a row in IMPROVEMENTS.md; add a regression test.

## The site is down or very slow
- `docker compose ps`: a container `unhealthy` or restarting → `docker compose logs app | tail -100`.
- Right after an update → it should have rolled back by itself; if not, roll back by hand.
- Disk full (Admin → Setup warns at 90%): `df -h`; old backups go first: `docker compose run --rm app ls -la /data/backups`.
- Memory: `docker stats --no-stream` (the app is capped at 768 MB). A restart (`docker compose restart app`) buys time.
- HTTPS certificate expired: `docker compose logs caddy | grep -i acme`; check that the domain's DNS still points here.

## Emails aren't going out
- `/api/health?full=1` → `email` says how long emails have waited. Admin → Setup shows the providers and today's counts.
- A provider down: the other one takes over (a provider failing 3 times in a row is skipped for 5 minutes); the cron
  retries failed emails 3 times within 24 hours. Check the provider's status page.
- Daily limit reached: optional emails (reminders, notifications) wait; raise the plan or add the second provider
  (`BREVO_API_KEY`), then `docker compose up -d`.
- Bounces or spam reports suspended the account: the provider's dashboard; addresses that bounce are already held back.

## The database is damaged or data was lost
1. `docker compose stop app scheduler`.
2. Restore the newest good backup (deploy/README.md → "Restoring a backup"); after losing the server, fetch the
   off-site copy first (`node scripts/offsite.mjs fetch`).
3. Start, check Admin → Setup, and tell GMs which bookings since the backup may be missing.

## An account may have been taken over
1. Admin → Users → the person → **Security log**: their failed logins (with how many per hour), wrong two-step codes,
   password or email changes, and whether they were already emailed a warning (after 5 wrong passwords, or 3 wrong
   codes, which means someone has their password).
2. If the person is locked out, `docker compose exec app node scripts/admin.mjs reset-2fa <email>` ends every session;
   they then use "Forgot password". A GM's payment details changed? Players were warned for 14 days on the game page;
   check Admin → GMs and restore the right details with the GM.
3. A GM account used for scams: Admin → Users → **Suspend** (their games are hidden, players with seats are told not to pay).

## A wave of scam listings or spam
- Admin → Reports: automatic flags appear there with the matched phrases.
- Suspend the accounts; tighten a rate limit for a while with `QUESTBOARD_RATE_LIMIT_OVERRIDES` in `deploy/.env`
  (e.g. `signup=20`), then `docker compose up -d`.

## A secret leaked (an API key, the cron secret, a backup or the database file)
- Change it at the source (the provider's dashboard), then in `deploy/.env` (deploy/README.md → "Changing a secret").
- The database or a backup leaked: passwords are scrypt-hashed and session tokens are stored only as hashes, but
  log everyone out to be safe: `docker compose exec app node scripts/admin.mjs end-sessions`. GMs' payment details
  and players' emails are personal data: tell the people affected and the authority as UU PDP (No. 27/2022) requires
  — get legal advice on the deadline and wording (docs/12-launch-checklist.md, legal review).
