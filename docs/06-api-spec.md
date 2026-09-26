# 06 · API Specification

There are two interfaces:

1. A **public REST API**: read-only JSON for partners, widgets and SEO tooling.
2. **Server actions**: the internal mutation contract used by the web forms. They are listed here so a future mobile app or write API can mirror them.

All money values are **whole Rupiah**. **No payment endpoints exist.** Quest Board never processes money.

---

## 1. Public REST API

Base URL `https://<host>/api`. No authentication. Returns `application/json`. Only `published` games are exposed. Responses are language-neutral: enum codes rather than translated labels.

### `GET /api/games`

| Query param | Type | Description |
|---|---|---|
| `q` | string ≤ 80 | Keyword across title, summary, tags, system, GM name, city and the GM’s location |
| `system` | string | Exact system name |
| `format` | `one_shot` \| `campaign` | |
| `location` | `online` \| `in_person` | |
| `language` | `id` \| `en` | Play language. Also matches bilingual (`both`) tables |
| `level` | `beginner` \| `experienced` | Includes `any` |
| `maxPrice` | integer (IDR) | e.g. `100000` |
| `free` | `1` | Only free games |
| `sort` | `soonest` \| `rating` \| `price_asc` \| `price_desc` \| `newest` | Default `soonest` |
| `city` | string ≤ 60 | In-person games in this city (case-insensitive) |
| `limit` | 1–100 | Default 30 |
| `offset` | integer ≥ 0 | Skip this many results (paging). Default 0 |

**200 OK**
```json
{
  "count": 1,
  "total": 1,
  "offset": 0,
  "data": [
    {
      "id": 3,
      "slug": "signal-from-tartarus-station",
      "title": "Signal from Tartarus Station",
      "system": "Mothership",
      "summary": "Sci-fi survival horror in English…",
      "format": "one_shot",
      "locationType": "online",
      "language": "en",
      "city": null,
      "price": { "amount": 60000, "currency": "IDR" },
      "seatsTotal": 5,
      "experienceLevel": "beginner",
      "tags": ["sci-fi", "horror", "survival", "beginner-friendly"],
      "gm": { "id": 1, "name": "Raka Pradipta", "verified": true },
      "rating": null,
      "reviewCount": 0,
      "nextSession": { "id": 14, "startsAt": "2026-09-30T13:00:00.000Z", "seatsLeft": 3 },
      "url": "/games/signal-from-tartarus-station"
    }
  ]
}
```

### `GET /api/games/{slug}`
**200 OK**: the full game, adding `description`, `platform`, `minAge`, `contentWarnings`, `safetyTools`, `gm.headline`, and `sessions[] { id, startsAt, durationMinutes, seatsLeft }`.
**GM payment details are intentionally never included.**

**404 Not Found**: `{ "error": "not_found" }`.

### Planned
`GET /api/gms/{id}` · `GET /api/systems` · `GET /api/calendar/{token}.ics` (private calendar feed) · rate limiting of 60 requests/min per IP (`429` + `Retry-After`).

---

## 2. Server actions (internal contract)

Defined in `web/src/app/actions.ts`. They take `FormData` and re-check the session and ownership on every call. Form actions return:

```ts
type FormState = { error?: MsgKey; fieldErrors?: Record<string, MsgKey>; ok?: boolean } | undefined
```

Errors are **translation keys** (e.g. `"err.full"`, `"v.price"`). The client renders them with `t()` in the viewer's language.

| Action | Auth | Inputs | Effect | Result |
|---|---|---|---|---|
| `setLanguageAction` | none | `lang = id \| en` | Sets the `qb_lang` cookie (1 year) and re-renders | – |
| `signupAction` | none | `name, email, password, role, next?` | Create user (+ GM profile), start session | redirect · `fieldErrors` |
| `loginAction` | none | `email, password, next?` | Start session | redirect · `error: err.badLogin` |
| `logoutAction` | any | – | End session | redirect `/` |
| `becomeGmAction` | user | `avatarImage` (allow-listed), `headline, systems, years, location, bio, paymentInfo` | Upsert GM profile, role → `gm` | redirect `/gm` · `fieldErrors` |
| `saveGameAction` | GM owner | Game fields incl. `language`, `price` (IDR text), `coverImage` (allow-listed), `id?` | Insert or update | redirect `/gm/games/:id` · `fieldErrors` |
| `archiveGameAction` | GM owner | `gameId` | → `archived` | redirect `/gm` |
| `addSessionAction` | GM owner | `gameId, startsAt, tzOffset, duration` | Insert session (UTC) | `{ ok }` · `fieldErrors.startsAt` |
| `cancelSessionAction` | GM owner | `sessionId` | Session → `cancelled`; seats → `cancelled` (`cancelled_by=gm`) | revalidate |
| `completeSessionAction` | GM owner | `sessionId` | → `completed` (after start only) | revalidate |
| `reserveSeatAction` | user | `sessionId, agree=on` | `canBook` in `BEGIN IMMEDIATE`; insert booking with `price_idr` snapshot | redirect `/dashboard?booked=:id` · `error` |
| `cancelBookingAction` | booking owner | `bookingId` | → `cancelled` (`cancelled_by=player`), before start only | revalidate |
| `postMessageAction` | game member | `gameId, body` | Insert message | `{ ok }` · `error` |
| `submitReviewAction` | eligible player | `gameId, rating, body` | Insert review | `{ ok }` · `fieldErrors` · `error` |

**Removed in v0.2:** `checkoutAction` (simulated payment), the refund logic and the fee calculation.


## 3. v0.9 server actions
| Action | Who | Notes |
|---|---|---|
| `updateProfileAction` | any user | name, bio, avatarImage (allow-listed), language → `{ ok }` |
| `changePasswordAction` | any user | currentPassword, newPassword; rotates the session; rate-limited |
| `createGmRequestAction` | any user | → redirect `/hire-a-gm/requests/<id>?created=1`; optional `gmId` (must be a GM) |
| `sendOfferAction` | GM | requestId, message, price; `err.requestClosed` / `err.alreadyOffered` |
| `chooseOfferAction` | requester | offerId → status `matched` |
| `closeRequestAction` | requester | → status `closed` |
| `postRequestMessageAction` | requester or matched GM | only when matched |

The public JSON API is unchanged. Requests and offers are not exposed.
