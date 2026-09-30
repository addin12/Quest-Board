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
  data volume, keeps the newest 14, and — once you set it up — copies the backup and new pictures to
  off-site storage (below). A backup on the same disk doesn't survive losing the disk.
- Point a free uptime monitor (e.g. UptimeRobot) at `https://<your domain>/api/health?full=1` every
  5 minutes: it fails when the site is down, the database is wrong, the job stopped or emails are stuck.
- **The admins' daily summary email** lists server errors, emails that couldn't be sent, and anything
  **Admin → Setup** marks "Fix" (a stopped backup or off-site copy, the scheduler not running, less
  than 1 GB of disk left…), so a problem doesn't wait for someone to open the admin console.

## Off-site backups

Set these up before launch: they are what saves the site if the server's disk dies.

1. Create a bucket at **Cloudflare R2** (the free tier covers a small site; no charge for downloads) or
   **Backblaze B2**. Keep it private.
2. Create an API key/token allowed to **write objects to that bucket only**.
3. Add a **lifecycle rule** on the bucket to delete objects older than, say, 60 days (old copies aren't
   deleted by Quest Board).
4. Fill in `QUESTBOARD_OFFSITE_*` in `.env`, then `docker compose up -d` and make the first copy now:

   ```sh
   docker compose exec scheduler npm run db:backup
   docker compose exec scheduler npm run db:offsite
   ```

**Admin → Setup** shows "Off-site copy of backups: OK" with the time of the last copy, and "Fix" if a
night's copy fails. To recover from it, see "Restoring a backup" below.

## Keeping the server safe

Once, when you set the server up (Ubuntu/Debian commands):

```sh
# Firewall: only SSH and the web. The app itself (port 3000) is never reachable from outside.
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
# Log in with an SSH key only: add your key to ~/.ssh/authorized_keys first, then set
#   PasswordAuthentication no   and   PermitRootLogin no   in /etc/ssh/sshd_config
sudo systemctl restart ssh
# Security updates install themselves.
sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

The kit already does the rest: the app runs as an unprivileged user on a read-only file system with no
extra Linux capabilities, logs rotate so they can't fill the disk, and only Caddy is exposed. Keep
`deploy/.env` readable only by you (`chmod 600 .env`): it holds your email and cron secrets.

## Updating

```sh
cd Quest-Board && git pull && cd deploy && docker compose up -d --build
```

The database migrates itself on start. Check `docker compose logs app` and Admin → Setup afterwards.

## Restoring a backup

From one of the nightly backups on the server:

```sh
docker compose stop app scheduler
docker compose run --rm app node scripts/db-backup.mjs restore /data/backups/<file>.db --yes
docker compose start app scheduler
```

**After losing the server** (a new server, the same `deploy/.env` including `QUESTBOARD_OFFSITE_*`):
first fetch the newest off-site copy and every picture, then restore the file it names.

```sh
docker compose up -d --build && docker compose stop app scheduler
docker compose run --rm app npm run db:fetch-offsite      # prints the restore command to run next
docker compose run --rm app node scripts/db-backup.mjs restore /data/backups/<file>.db --yes
docker compose start app scheduler
```

The restore checks the backup first and keeps the database it replaces next to it. The production
rehearsal (`npm run rehearsal`) goes through exactly these steps after deleting everything. See
`docs/11-operations-and-deployment.md` for everything else (moderation, admin accounts, lost phones).
