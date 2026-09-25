# 10 · Security, Privacy, Trust & Safety

## 1. Threat model summary

| Asset | Threat | Control (MVP) | Next |
|---|---|---|---|
| Accounts | Credential stuffing, weak passwords | scrypt (N=16384, 64-byte key, 16-byte salt); ≥ 8-character passwords; generic login error; **rate limit of 10 logins per 10 min per IP+email, and 10 sign-ups per hour per IP** | Email verification, 2FA for GMs |
| Sessions | Theft / fixation | 256-bit token, **only the SHA-256 hash is stored**; httpOnly, SameSite=Lax, Secure in production; 30-day expiry; revoked on logout; **rotated when a player becomes a GM; expired rows purged; "Log out on all devices"** | – |
| Server actions | Direct POST bypassing the UI | Every action re-checks the session and ownership or membership | Audit log |
| CSRF | Cross-site posts | Next.js server-action Origin check + SameSite cookies | – |
| Privilege escalation | Sign up as admin | Role allow-list, unit tested | – |
| SQL injection | Crafted input | Parameterised queries only; fixed `ORDER BY` map | – |
| XSS / clickjacking | Script in user content, framing | React escapes all output; no `dangerouslySetInnerHTML`; **CSP (`default-src 'self'`, `frame-ancestors 'none'`), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy** | Nonce-based CSP to drop `'unsafe-inline'` |
| Open redirect | `?next=//evil` | `safeNext()` allows only relative paths | – |
| Overbooking | Race conditions | `BEGIN IMMEDIATE` + partial unique index | – |
| **GM payment details** | Harvesting of bank or e-wallet numbers | Shown only to game members; excluded from profiles, search and the API (e2e tested); ≤ 500 characters | Rate-limit account creation; flag profiles whose payment text changes often |
| Language cookie | Tampering | Only `id` or `en` accepted; anything else falls back to `en` | – |
| Spam / abuse | Chat, reservation or review flooding | **Rate limits: 30 chat posts / 30 reservations per 10 min, 10 reviews per hour, per user** | Keyword flagging |
| Cover images & portraits | Pointing images at arbitrary or malicious URLs, or taking another GM's portrait | **Allow-lists: gradient or initials, built-in library art, or the current value** (`isAllowedCover`, `isAllowedPortrait`, unit tested) | Same principle for future uploads |
| Search | Wildcard injection in LIKE | **`escapeLike()` + `ESCAPE '\'`** | Full-text search |

## 2. No payments = smaller attack surface
Quest Board stores **no card data, bank credentials, balances or transactions**. That means:
- No PCI-DSS scope.
- No payment licensing under Bank Indonesia or OJK rules for the platform in this phase.
- No refund or chargeback operations.

The trade-off is **trust**: players transfer money to GMs directly. Mitigations are in §4.

## 3. Privacy (Indonesia PDP Law — UU No. 27/2022 — readiness)
- **Personal data collected:** name, email, password hash, bio, reservations, reviews, chat messages, and GM payment details (which the GM supplies about themselves).
- **Purpose limitation:** payment details are shown only to players who have reserved, for the purpose of paying that GM.
- **Erasure:** `ON DELETE CASCADE` supports full account deletion. Phase 2 adds self-serve deletion that anonymises reviews.
- **Access / export:** phase 2 adds a JSON download.
- **Cookies:** `qb_session` (strictly necessary) and `qb_lang` (preference). There are no tracking cookies.
- **Data location:** consider hosting in the Singapore or Jakarta cloud regions (see [ops](11-operations-and-deployment.md)).
- The privacy notice and terms must be published in **Bahasa Indonesia** (the legally relevant language) and in English.

## 4. Trust & safety (product)

**Built:**
- Safety tools and content warnings on every listing; minimum age; experience level; play language.
- A verified GM badge (set by an admin).
- Reviews only from real attendees, one per game.
- Private table chat for members only.
- Payment details appear only **after** reserving, with clear copy that Quest Board doesn't handle money and that refunds are arranged with the GM.
- The reservation checkbox acknowledges the safety tools, the community guidelines and off-platform payment.

**Planned:**
- A report button on listings, profiles, reviews, chat and payment details. An admin queue with a 24h SLA.
- ~~Anti-scam guidance~~ **Done (v0.5):** shown under the GM's payment details.
- Optionally limit new unverified GMs to lower prices until they have N completed sessions.
- A GM reliability indicator (cancellations) and a player reliability indicator (late drops, no-shows).
- A code of conduct in ID and EN, accepted at GM onboarding.

## 5. Secure development
- Minimal dependencies; `server-only` guards the DB and auth modules.
- Secrets only in environment variables (none are needed today).
- PR checklist: authorization check? validation? strings in both languages? tests?


## 6c. v0.11: reports & moderation
- **Report:** only signed-in people, never their own content, and only things they can see (for example, table chat only if they're a member). One open report per person per target, rate-limited at 10/h.
- **Evidence:** a snapshot of the content (for member reports, including payment details) is stored with the report and shown only to admins.
- **Admin-only actions** re-check `requireAdmin()` on the server. The console answers 404 to everyone else.
- **Suspension** ends every session at once, and `getCurrentUser` ignores suspended accounts. Login shows a clear "suspended" message only after a correct password, so it can't be used to probe accounts.

## 6b. v0.11: account security & privacy rights
- **Reset and verify tokens** are 32 random bytes and stored only as SHA-256 hashes. They're single-use (an atomic `UPDATE … RETURNING`) and expire (1 h reset, 7 d verify). Issuing a new token voids the old one.
- **"Forgot password"** gives the same answer for every email (no account enumeration) and is rate-limited per IP + email. A successful reset revokes every session.
- **Deletion** needs the password plus an explicit confirmation, and it's rate-limited. Personal data is scrubbed at once and the account can never log in. Deleted GMs 404 and can't receive direct requests.
- **Export** is only for the signed-in person (401 otherwise) and is `no-store`.
- **The dev outbox** exposes live links, so it's disabled whenever HTTPS is enforced.

## 6. v0.9: requests, offers and settings
- **Payment details:** `payment_info` is still members-only. In the hire flow it is shown only to the requester, and only after they choose that GM's offer.
- **Access control:** request pages 404 for anyone who is not the requester, an eligible GM, or a GM who has offered. Every write action re-checks authorisation server-side (never trust hidden fields).
- **Abuse limits:** requests 5/h, offers 30/h, password changes 5 per 15 min, per user.
- **Password change:** requires the current password and ends every other session.
- **Portraits:** the allow-list applies to players too; no arbitrary URLs.
- **Scams:** the anti-scam note is repeated next to the payment details in the request thread.
