# 01 · Product Requirements Document (PRD)

**Product:** Quest Board, a community marketplace for tabletop RPG games in **Indonesia**
**Status:** MVP implemented (v0.4) · **Owner:** Product · **Last updated:** 2026-09-24

**Changes in v0.2 (stakeholder feedback)**
1. All platform payments and commission are removed. GMs keep 100%, and players pay GMs directly.
2. The currency is IDR (Rupiah) and the target market is Indonesia.
3. The UI is bilingual: Bahasa Indonesia and English. (Indonesian was the default until v0.4; English is the default since then.)

**Changes in v0.3**
1. D&D is listed as two systems: **D&D 5e (2014)** and **D&D 5.5e (2024)**. The rules differ enough that players need to know which edition a table uses.
2. The visual design now uses **Flaticon UIcons** throughout, credited in the footer as the license requires.

**Changes in v0.4**
1. **English is the default UI language** for every visitor. Bahasa Indonesia is one click away and remembered.
2. The GM profile's **Timezone** field is replaced by **Location**: a city, or "Online" for GMs who only play online.

---

## 1. Summary

Quest Board connects **players** who want to play tabletop role-playing games (D&D, Pathfinder, Call of Cthulhu, Daggerheart…) with **Game Masters (GMs)** across Indonesia. GMs list games and set their own price per seat in Rupiah, or run them for free. Players browse, **reserve a seat for free**, and pay the GM **directly** (bank transfer, e-wallet, QRIS). Afterwards they review the game.

**Quest Board does not process money and takes no commission.** In this phase the platform is a discovery and scheduling board: listings, seats, rosters, table chat and reviews.

The product is inspired by [StartPlaying](https://startplaying.games) but is an independent, original product. It is not affiliated with StartPlaying.

## 2. Problem (Indonesian context)

| Who | Pain |
|---|---|
| Players | TTRPG groups are spread across Discord servers, Instagram and WhatsApp groups. It's hard to find a table that fits your schedule, language (Indonesian or English), city and experience level. Beginners don't know where to start, and there is no trusted signal (reviews) about a GM. |
| GMs | GMs promote their tables manually in many groups. Tracking who has joined which session is done in chat, and there's no place to build a public reputation. |

## 3. Market reference & positioning

**Reference (StartPlaying):** a global marketplace, mostly English-language and online, with USD pricing. It takes a 15% commission and processes payments itself ([fee](https://intercom.help/startplaying/en/articles/14724019-what-does-the-15-fee-cover), [refunds](https://intercom.help/startplaying/en/articles/8719194-refund-policy)).

**Quest Board's positioning for Indonesia:**
1. **0% commission, no payment middleman.** This removes the biggest barrier for local GMs and matches the local habit of paying by transfer or e-wallet.
2. **Bilingual: English by default, Bahasa Indonesia one click away.** The UI is fully bilingual, and every game declares its **play language** (Indonesian, English, or both).
3. **Rupiah pricing** with local formatting (`Rp 75.000`).
4. **First-class in-person games** in Indonesian cities (Jakarta, Bandung, Yogyakarta, Surabaya…) alongside online games.
5. **Safety and beginner-friendliness up front.** Safety tools, content warnings, minimum age and experience level appear on every listing.

## 4. Goals & non-goals

### Goals (MVP)
- G1. A player can go from landing page to reserved seat in **under 2 minutes**.
- G2. A GM can go from sign-up to a published, bookable listing in **under 10 minutes**.
- G3. Seat inventory is always correct: no overbooking, even when two players race for the last seat.
- G4. Trust signals (reviews, verification, safety info) are visible before reserving.
- G5. Every screen is fully usable in both Bahasa Indonesia and English.

### Non-goals (this phase)
- **Any payment processing, commission, escrow, refunds or payouts.** Money is settled between the player and the GM. The platform only shows the price and the GM's own payment instructions.
- Email, WhatsApp or push notifications.
- Built-in video or VTT. Games run on Discord, Foundry, Roll20, or in person.
- Real-time chat (the chat refreshes on each post).
- Other currencies and other languages.
- Waitlists, subscriptions and group or private bookings.

## 5. MVP scope (built)

| # | Capability | Status |
|---|---|---|
| F1 | Accounts: sign up, log in, log out, player or GM role | ✅ |
| F2 | Browse and search with filters: system, **play language**, format, online/in-person, experience, max price (Rp), free only; sorting | ✅ |
| F3 | Game page: description, schedule with live seat counts, safety tools, content warnings, GM card, reviews | ✅ |
| F4 | **Reserve a seat** (free, no payment step) with acknowledgement of the table rules | ✅ |
| F5 | **GM payment details** (optional free text on the GM profile), shown only to players who have booked | ✅ |
| F6 | Player dashboard: upcoming, played and cancelled games; give up a seat any time before start | ✅ |
| F7 | Become a GM: profile onboarding (headline, systems, experience, **location** (city or "Online"), bio, payment details) | ✅ |
| F8 | GM dashboard: live games, upcoming sessions, players booked, **expected income** (informational) | ✅ |
| F9 | Listing management: create, edit, draft, publish, archive; price in Rupiah; play language | ✅ |
| F10 | Session management: schedule in local time, cancel (releases all seats), mark as played, roster | ✅ |
| F11 | Public GM profile with stats, games and reviews | ✅ |
| F12 | Reviews: one per player per game, only after playing | ✅ |
| F13 | Table chat: private board for the GM and booked players | ✅ |
| F14 | **Bilingual UI** (EN default / ID) with a header switcher, remembered in a cookie | ✅ |
| F15 | Public read-only JSON API | ✅ |

## 6. Business model

**Current phase: free for everyone, 0% commission.** The priority is liquidity: growing the number of GMs and players in the Indonesian community.

Revenue options for later, each needing a separate decision and none planned now: featured or promoted listings, a GM Pro tier (analytics, recurring schedules, custom profile), sponsored events with game stores, cafés and publishers, and optional integrated payments (Midtrans, Xendit) for GMs who *want* them.

## 7. Success metrics

| Metric | Definition | Target (first 90 days) |
|---|---|---|
| Reservation conversion | Reservations ÷ unique game-page visitors | ≥ 6% |
| Seat fill rate | Reserved seats ÷ offered seats in sessions that have started | ≥ 60% |
| Time to first listing | GM sign-up → first published game with a session | median ≤ 10 min |
| Active GMs | GMs with ≥ 1 upcoming session | 50 |
| Repeat reservation rate | Players with ≥ 2 reservations within 60 days | ≥ 35% |
| Review rate | Reviews ÷ completed seats | ≥ 25% |
| No-show / late-cancel rate | Seats given up < 24h before start ÷ seats | ≤ 10% |
| Language mix | Share of sessions viewed in EN vs ID | Tracked (informs content priorities) |

## 8. Assumptions & open questions

| # | Question | Default taken in MVP |
|---|---|---|
| Q1 | How do players pay? | Directly to the GM, using the method the GM lists (bank transfer, GoPay, OVO, DANA, QRIS…). Not verified by the platform. |
| Q2 | Refunds? | Between the player and the GM. The GM states their terms in the payment details. The platform only releases seats. |
| Q3 | Late cancellations and no-shows? | Players can give up a seat any time before start. Phase 2 adds a reliability indicator. |
| Q4 | Should payment details be public? | No. They are shown only to the GM and to players with a confirmed seat in any of the GM's games (strictly: the viewer must be a member of that game). |
| Q5 | Timezones | Stored in UTC. Shown in the viewer's zone, and server-rendered in WIB (Asia/Jakarta). The GM enters times in their own zone (WIB, WITA or WIT all work). |
| Q6 | Default language | **English** for everyone, unless the visitor has picked a language with the switcher (cookie). Browser language is not used. |
| Q8 | GM location | A free-text city, or "Online". Any casing of "online" and an empty value are stored as "Online". It is informational only; session times use the GM's browser clock. |
| Q7 | Should user content (titles, descriptions) be translated? | No. It is shown as the GM wrote it. The play-language field tells players what to expect. |

## 9. Related documents

[Personas & stories](02-personas-and-user-stories.md) · [Functional spec](03-functional-spec.md) · [Architecture](04-technical-architecture.md) · [Data model](05-data-model.md) · [API](06-api-spec.md) · [UX/UI](07-ux-ui-spec.md) · [Roadmap](08-roadmap-and-plan.md) · [Testing](09-testing-and-qa.md) · [Security & trust](10-security-trust-safety.md) · [Ops & deployment](11-operations-and-deployment.md)
