# Email that lands in the inbox: DNS for Resend and Brevo

Quest Board sends sign-up confirmations, password resets and session reminders through **Resend**,
with **Brevo** as the backup (both have free plans: 100 and 300 emails a day). With both set up, Resend
is tried first and Brevo takes over when Resend is down or full; near the day's limit, notification
emails and reminders wait so that sign-ups and password resets always get through.
Gmail, Yahoo and Outlook now expect every sender to prove the mail is really theirs — without these
records, confirmation emails go to spam or are rejected, and new players can't finish signing up.

You add three kinds of DNS records at your domain registrar (Niagahoster, Rumahweb, Cloudflare, …):

| Record | Proves | Where it comes from |
|---|---|---|
| **SPF** | Resend's servers may send for your domain | Resend's domain page |
| **DKIM** | each email was signed by you and not changed | Resend's domain page |
| **DMARC** | what receivers should do with mail that fails the other two | you write it (below) |

## 1. Add your domain in Resend

Resend → **Domains → Add domain**. Use a subdomain you'll send from or the bare domain
(e.g. `questboard.id`), and pick the region closest to your players if offered. Resend then shows the
exact records for *your* domain. **Copy the values from Resend** — the examples below only show what
they look like.

## 2. Add Resend's records at your registrar

They look like this (names are relative to your domain; some registrars want the full name, e.g.
`send.questboard.id`):

| Type | Name | Value (example — use Resend's) | Priority |
|---|---|---|---|
| MX | `send` | `feedback-smtp.<region>.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4…` (a long key) | |

- The MX and SPF records sit on the **`send` subdomain**, so they don't touch any email you receive
  on the bare domain (e.g. Google Workspace) — keep your existing MX records as they are.
- If the bare domain already has an SPF record (`v=spf1 …`), don't add a second one on the same name.

Back in Resend, press **Verify**. DNS can take from minutes to a few hours; Resend shows each record
turning green.

## 3. Add a DMARC record

One TXT record on `_dmarc`:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@questboard.id` |

- `p=none` only *reports* failures — start there. After a few weeks without problems, change it to
  `p=quarantine` so forged mail from your domain goes to spam.
- `rua=` is where receivers send daily reports; any address you read works (or leave it out).

## 4. The backup provider: Brevo

Brevo → **Senders, Domains & Dedicated IPs → Domains → Add a domain** (the same domain). Brevo shows the
records for your domain — a `brevo-code` TXT record and its DKIM records, and sometimes SPF and DMARC.
Add them at your registrar the same way, and press **Authenticate** in Brevo.

- Keep the DMARC record from step 3; you only need one.
- If Brevo asks for an SPF `include:` on a name that already has an SPF record, add the `include:` to
  the existing `v=spf1 …` record instead of creating a second one.
- Then Brevo → **SMTP & API → API keys → Generate a new API key**.

## 5. Tell Quest Board

In `deploy/.env`:

```sh
RESEND_API_KEY=re_…                                # Resend → API Keys → Create (sending access is enough)
BREVO_API_KEY=xkeysib-…                            # Brevo → SMTP & API → API keys
QUESTBOARD_MAIL_FROM=Quest Board <halo@questboard.id>   # must be on the domain you verified
# On a paid plan, its daily limit (0 = none): RESEND_DAILY_LIMIT=…, BREVO_DAILY_LIMIT=…
```

Then `docker compose up -d`. **Admin → Setup** shows "Email provider: OK", "Backup email provider: OK"
and how many of the day's emails have been used.

## 6. Check it works

1. Sign up on the live site with a Gmail address. The confirmation should arrive in the **inbox**
   within a minute.
2. In Gmail open it → **⋮ → Show original**. You want `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.
3. For a second opinion, send a password-reset email to the address shown on
   [mail-tester.com](https://www.mail-tester.com) and aim for 9/10 or better.

Notification emails and session reminders carry Gmail's and Yahoo's one-click **Unsubscribe**
header (`List-Unsubscribe`), which turns just that kind of email off in the person's settings.
Security emails and safety warnings don't carry it and are always sent.

If something fails: Resend's domain page says which record it can't find; `nslookup -type=TXT
resend._domainkey.questboard.id` (or `dig`) shows what the world sees. Emails that fail to send are
retried by the scheduler and counted in the admins' daily digest.
