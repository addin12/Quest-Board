# 02 · Personas & User Stories

## Personas

### P1 · "Penasaran Putri": new player (Jakarta)
- 24 years old. Has watched TTRPG actual-plays on YouTube and wants to try D&D, but has no group and no rules knowledge. Most comfortable in Bahasa Indonesia.
- **Needs:** reassurance that beginners are welcome, games in Indonesian, a low price or free, and a clear idea of what will happen.
- **Fears:** looking stupid, an unsafe table, and paying a stranger without knowing whether the game is legitimate.
- **Key features:** the "Saya pemula" filter, the **Bahasa Indonesia** language filter, the beginner section on the home page, safety tools, reviews, and free reservation before paying.

### P2 · "Busy Bima": experienced player (Surabaya)
- 35 years old, has played for 15 years. Their home group disbanded. Happy to play in English and willing to pay for a good GM.
- **Needs:** specific systems (PF2e, Blades), set time slots after work (19.00–22.00 WIB), and a quality bar.
- **Key features:** system and language filters, sorting by rating, reviews, campaign listings.

### P3 · "Pro GM Raka": semi-professional GM
- Runs 4–8 paid sessions a week on Discord and takes payment by BCA transfer or GoPay.
- **Needs:** full tables, a clear roster, and no platform cut. Wants a public reputation instead of promoting in 10 WhatsApp groups.
- **Key features:** GM dashboard, roster, payment details shown to booked players, reviews, public profile, 0% commission.

### P4 · "Side-hustle Dewi": new GM (Bandung)
- Has run games for friends and wants to open tables to the public, both in person at a board-game café and online.
- **Needs:** fast listing, pricing guidance in Rupiah, and a way to earn first reviews (free games).
- **Key features:** onboarding, a listing form with sensible defaults (Rp 50.000, 5 seats), drafts, free games, in-person listings with a city.

### P5 · English-speaking expat or visitor
- Lives in Bali or Jakarta and doesn't read Indonesian well.
- **Needs:** an English UI and English-language tables.
- **Key features:** the EN switcher and the play-language filter "English" (which includes bilingual tables).

### P6 · Trust & Safety admin (internal)
- **Needs:** to verify GMs and remove bad listings. In the MVP this is done through the database and the `admin` role.

---

## User stories & acceptance criteria

Priority uses MoSCoW: **M** = must, **S** = should, **C** = could. ✅ = implemented in the MVP.

### Language & locale
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-01 | As a first-time visitor, I see the site in English by default. | M | With no language cookie the UI is in EN and `<html lang="en">`, whatever the browser language. The EN button is shown as active. | ✅ |
| US-02 | As any visitor, I can switch between EN and ID. | M | The header switcher (ID/EN) works without JavaScript, the choice persists for a year in the `qb_lang` cookie, and every page, form error and dialog is translated. | ✅ |
| US-03 | As a player, I see prices in Rupiah. | M | Prices show as `Rp 75.000` (Indonesian grouping, no decimals), and $0 shows as "Gratis" or "Free". | ✅ |
| US-04 | As a player, I see times in my local time. | M | Times are shown in the browser's zone and language (e.g. "Sab, 26 Sep, 19.00 WIB"). | ✅ |
| US-05 | As a player, I can filter by play language. | M | ID matches `id` + `both`, and EN matches `en` + `both`. Cards show the play language. | ✅ |

### Discovery
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-10 | As a visitor, I can search by keyword. | M | Matches title, summary, tags, system, GM name and **city**. Capped at 80 characters. | ✅ |
| US-11 | As a player, I can filter by system, format, online/in-person, experience and max price. | M | Filters combine with AND and persist in the URL. The max price accepts `100.000` or `100000`. "Clear" resets them. | ✅ |
| US-12 | As a player, I can sort by soonest, rating, price or newest. | S | The default is soonest. Games with no upcoming session sort last. | ✅ |
| US-13 | As a new player, I can find beginner-friendly games quickly. | M | A home-page section plus the `level=beginner` filter. | ✅ |
| US-14 | As a player, I see the next session and seats left on each card. | M | Shown in local time. "Penuh"/"Full" appears in red; ≤ 2 seats left appears in the accent colour. | ✅ |

### Evaluation
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-20 | As a player, I can read full game details before reserving. | M | Shows description, format, platform or city, play language, experience, minimum age, safety tools, content warnings, and a "Payment" explanation (paid directly to the GM, 0% commission). | ✅ |
| US-21 | As a player, I can see all upcoming sessions and their availability. | M | Each session shows date/time, length and seats left. The Book button appears only when a seat can be reserved. | ✅ |
| US-22 | As a player, I can view the GM's profile, stats and reviews. | M | Shows rating, review count, seats played, years, systems, bio, games and recent reviews. Payment details are **not** shown here. | ✅ |

### Reservation & payment (off-platform)
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-30 | As a player, I can reserve a seat without paying on the site. | M | Requires login (redirects back afterwards) and ticking the table-rules checkbox. There are no card fields. The page states "You pay Rp X directly to the GM". The seat is re-checked in a DB transaction. | ✅ |
| US-31 | As a booked player, I can see how to pay the GM. | M | The "How to pay the GM" card on the game page shows the GM's payment details, visible only to members. If empty, it prompts me to ask in the chat. | ✅ |
| US-32 | As a GM, I can tell booked players how to pay me. | M | An optional "How players pay you" field (≤ 500 characters) on the GM profile. The hint recommends including refund terms. It is never exposed in the public API. | ✅ |
| US-33 | As a player, I can't double-book, book a full or past session, or book my own game. | M | Each case shows a clear translated reason. A unique index enforces "one active seat per player per session". | ✅ |
| US-34 | As a player, I can give up my seat before the session starts. | M | The confirmation dialog reminds me to arrange any refund with the GM. The booking becomes `cancelled` (by player). | ✅ |
| US-35 | As a player, I'm told when a GM cancels a session. | M | The booking shows "Dibatalkan oleh GM" / "Cancelled by GM". | ✅ |
| US-36 | As a GM, I can mark which players have paid. | S (phase 2) | A per-seat "paid" toggle on the roster, visible only to the GM. | ⏳ |

### Community
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-40 | As a booked player or GM, I can post in the table chat. | S | Members only. 1–1000 characters. GM messages carry a GM badge. | ✅ |
| US-41 | As a player who played, I can leave one review per game. | M | Allowed after a booked session has started or been completed. Rating 1–5, text ≤ 2000 characters. | ✅ |

### GM tools
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-50 | As a user, I can become a GM. | M | Headline ≥ 5 and bio ≥ 30 characters. My role becomes `gm`. | ✅ |
| US-50a | As a GM, I can state where I play: my city, or Online. | M | A "Location" field (with suggestions: Online, Jakarta, Bandung, Surabaya, Yogyakarta…) replaces Timezone. Empty or "online" is saved as "Online". The public profile shows "Location: Jakarta", or "Location: Online" with a laptop icon. | ✅ |
| US-51 | As a GM, I can create a listing with a Rupiah price and play language. | M | Price is Rp 0–10.000.000 and accepts `75.000`. Play language is ID, EN or both. Validation per [functional spec §4](03-functional-spec.md#4-game-listing). | ✅ |
| US-52 | As a GM, I can edit or archive a listing. | M | Owner or admin only. Archived games vanish from search, but bookings are kept. | ✅ |
| US-53 | As a GM, I can schedule sessions in my local time. | M | Must be in the future. 2–6 hours. Stored in UTC. | ✅ |
| US-54 | As a GM, I can see who is booked into each session. | M | The roster shows avatar and name. | ✅ |
| US-55 | As a GM, I can cancel a session. | M | The confirmation says how many seats will be released and reminds me to handle refunds directly. | ✅ |
| US-62 | As a GM, I can change the time of an upcoming session without losing its bookings. | M | Booked players keep their seats and get a notification and an email with the old and new time; reminders are sent again for the new time; calendar feeds update. | ✅ |
| US-56 | As a GM, I can mark a past session as played. | S | Only after the start time. Unlocks reviews. | ✅ |
| US-57 | As a GM, I can see my expected income. | S | The sum of reserved seats × the price at reservation time, for upcoming sessions. Labelled "paid to you directly". | ✅ |

### Platform
| ID | Story | Pri | Acceptance criteria | |
|---|---|---|---|---|
| US-60 | As a partner, I can read public game data as JSON. | C | `GET /api/games`, `GET /api/games/:slug`. Prices are `{amount, currency:"IDR"}`. No payment details are included. | ✅ |
| US-61 | As an admin, I can verify GMs and moderate. | S (phase 2) | Admin console. In the MVP this is done through the DB and the `admin` role. | ⏳ |
