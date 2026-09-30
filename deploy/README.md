# Deploying Quest Board

One small Linux server runs everything with Docker: the app, a scheduler (reminders every 5 minutes, a
backup every night) and Caddy (HTTPS, with certificates it gets and renews itself). All data — the
SQLite database, uploaded pictures and backups — lives in one Docker volume, `questboard-data`.

## What you need

- A server close to your players (Jakarta or Singapore), 1 vCPU / 1–2 GB RAM is plenty to start, with
  Docker and the Docker Compose plugin installed, and ports 80 and 443 open.
- A domain, with an **A record** pointing at the server's IP (and `www` too, if you want it).
- A **Resend** account with that domain verified — see [EMAIL-DNS.md](EMAIL-DNS.md).

## First start

```sh
git clone https://github.com/addin12/Quest-Board.git && cd Quest-Board/deploy
cp .env.example .env
nano .env                      # fill in every REQUIRED value
docker compose up -d --build   # builds the image (a few minutes), then starts app, scheduler and Caddy
docker compose logs app        # "setup PROBLEM: …" lines mean something in .env still needs fixing
```

Then create your admin account (production has no demo admin) — it prints a one-time password:

```sh
docker compose exec app npm run admin -- create you@example.com "Your Name"
```

Log in at `https://<your domain>/login`, change the password in Settings, and turn on **two-step login**
(the admin console requires it). Open **Admin → Setup**: every line should say OK. The scheduled job
and the backup lines turn OK after the scheduler's first run (5 minutes) and first night.

## Every day it runs by itself

- **Every 5 minutes** the scheduler calls the app's job: session reminders, notification emails and
  retries, waitlist offers, the admin error digest, and clean-up.
- **Every night** (03:00 WIB by default) it backs up the database and pictures into `backups/` on the
  data volume and keeps the newest 14. **Copy them off the server too** — a backup on the same disk
  doesn't survive losing the disk. For example, nightly from another machine:
  ```sh
  ssh you@server "docker run --rm -v deploy_questboard-data:/data alpine tar czf - -C /data backups" > questboard-backups.tgz
  ```
- Point a free uptime monitor (e.g. UptimeRobot) at `https://<your domain>/api/health?full=1` every
  5 minutes: it fails when the site is down, the database is wrong, the job stopped or emails are stuck.

## Updating

```sh
cd Quest-Board && git pull && cd deploy && docker compose up -d --build
```

The database migrates itself on start. Check `docker compose logs app` and Admin → Setup afterwards.

## Restoring a backup

```sh
docker compose stop app scheduler
docker compose run --rm app node scripts/db-backup.mjs restore /data/backups/<file>.db --yes
docker compose start app scheduler
```

The restore checks the backup first and keeps the database it replaces next to it. See
`docs/11-operations-and-deployment.md` for everything else (moderation, admin accounts, lost phones).
