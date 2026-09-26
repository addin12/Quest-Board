# DESIGN: visual & content system

The full UX spec (flows, screens, sitemap) is in `docs/07-ux-ui-spec.md`. This file holds the rules to follow when touching UI.

## Personality
**A medieval tavern where adventurers find their party.** By day it's parchment and ink; at night (dark mode) it's a candlelit room of dark oak and amber. The header, footer and phone tab bar are always dark oak planks with a brass trim, like a tavern signboard. It should feel warm and welcoming to beginners, never grim, and never generic "gamer neon".

## Tokens (`web/src/app/globals.css`)
| Token | Light (parchment) | Dark (candlelit) | Wood (`.on-wood`) | Use |
|---|---|---|---|---|
| `bg` | #efe3c8 | #16100a | #2a1b10 | page |
| `surface` / `surface-2` | #faf3e3 / #e9dcbf | #22180f / #2e2217 | #332215 / #3b2819 | cards, inputs / chips, fills |
| `text` / `muted` | #2b1d10 / #665034 | #f0e3c6 / #c4ae8b | #f3e6c8 / #d6c09b | ink / secondary |
| `border` | #cdb68c | #4d3825 | #5a3f27 | aged edges |
| `accent` (+`-hover`, `-soft`, `-ink`) | #8e2b1c oxblood | #e8a54b amber | #eab35a candle | primary actions ("wax seal"), active states |
| `gold` | #85600f | #e8c46c | #eab35a | brass: stars, ornaments |
| `success` / `danger` (+`-soft`) | forest / blood red | lighter | — | notices, badges |

- Every text/background pair is ≥ 4.5:1, and the axe sweep enforces it. Re-run `npm run test:e2e` after touching tokens.
- **Scopes:**
  - `.on-wood` switches any area to the dark-oak palette. Add `.wood-plank` for the grain texture.
  - `.parchment` switches back to the page palette. The bell popover uses it inside the header.
  - Components never need to know which one they're in.
- **Textures** come from `npm run tavern-art` (`public/textures/*`, script-free SVG): paper grain on the light page, faint oak grain on the dark page, and oak planks for wood areas.
- **Shape language:** `rounded-md`/`rounded-lg` (no pills), cards with an inner burnt-edge shadow (`--card-shadow`), and primary buttons like a wax seal (inset highlight plus a dark lip).
- **Ornament:** `<span aria-hidden className="ornament" />` draws the ❦ flourish (a CSS mask in brass). Use it sparingly: the hero, the footer, and big section breaks.
- Use the tokens through Tailwind (`bg-surface`, `text-accent`…), never raw hex. The exceptions are the wood trim `#8a6a3a` and the hero wash.

## Imagery
- **Game covers** are 1200×600 SVG scenes in a flat, layered, storybook style: gradient sky, silhouette landscape and one clear focal motif.
  - **Keep the focal point in the vertical middle band (y ≈ 170–430).** Wide hero banners crop to roughly 4.5:1, and cards to roughly 3:1.
  - The palette derives from the game's `cover_hue`, so art and gradient fallbacks feel related.
- **GM portraits** are 512×512 SVGs: a friendly flat bust on a hue gradient, with one identifying accessory each (hood and d20 pendant, flower, beanie and goggles, hijab). They are shown in circles by `Avatar`. Keep faces centred and simple, and keep representation respectful and diverse.
- **Cover picker (game form):** a grid of 2:1 tiles (2, 3 or 4 columns by breakpoint). They are real radio inputs, and the selected tile gets an accent border, a ring and a check badge. The order is Colour gradient → Current cover (only for non-library demo art) → the library. Tile names are translated (`cover.<motif>`).
- **Portrait picker (GM profile form):** round tiles (4 or 5 columns), with Initials → Current portrait (demo art only) → the library, plus a live preview card above. Tiles have translated `aria-label`s ("Portrait 3" / "Potret 3"). Both pickers use `ImageChoiceGrid`; reuse it for any future image choice.
- **Fallbacks are part of the design:** no image means a hue gradient cover or an initials avatar, never a broken image.
- **Never** hot-link external images. The CSP allows only `'self'`, and the placeholders need no attribution.

## Categories & hire page
- **Every genre and play style has one icon** (`GENRES`/`STYLES` in `lib/categories.ts`). Use the same icon everywhere: chips, tiles and filters.
  - Genres: dragon, skull, ghost, rocket, bolt, fingerprint, radiation, city, castle, campfire.
  - Styles: theater-masks, sword, chess, sparkles, brain, map, puzzle, axe, feather.
- **Category tiles** (`/browse`): an accent-soft icon tile, the name, a count and a one-line description. **System cards** use the system's most recent cover art with a dark bottom gradient and the name in Cinzel.
- **Chips:** on a game page, genres are accent-tinted links, and styles and system are neutral links. A game card shows at most one genre chip, and only when there is no "beginner" chip.
- **Hire page rhythm:** hero with a 2×2 stat grid → three ways (the third card is highlighted with an accent border) → directory card with filters → genre and style chips → why (4) → use cases (4) → FAQ (`<details>`, one open at a time is fine) → accent CTA band.
- **GM card:** portrait 64px, verified badge, headline, stars, "sessions hosted", years, location, system chips (dice icon) and genre chips, "From Rp…", then Profile (ghost) and Request (primary).
- **Request status:** Open = accent, Matched = success, Closed = muted.

## Navigation & notifications
- **Phones (< sm):** a fixed bottom tab bar (icon + 11 px label; the active tab is accent-coloured with `aria-current="page"`). The top bar keeps logo, EN|ID, bell, avatar and log out. `body` gets `pb-16` so the footer isn't covered.
- **Bell:** a ghost icon button with a round `badge` (count, "9+" cap). Its accessible name includes the count ("Notifications, 3 unread").
  - Clicking it opens a **popover** (`.parchment popover`, 22 rem wide, full width under the header on phones): the title, "See all", the GM open-request strip, and the 8 latest items with unread dots.
  - Opening it marks everything read. Escape or clicking outside closes it, and focus returns to the bell.
- **Notification rows:** actor avatar, a kind icon in accent, one sentence and a relative time. Unread rows get an accent border, a faint accent-soft background and a "New" chip.
- **Contrast:** light-theme `--accent-soft` (#faebe4) and `--success-soft` (#e9f5ec) are tuned so accent/success text on them is ≥ 4.5:1. Re-check with the axe sweep if you touch tokens.

## Theme, toasts, sheets
- **Theme switch:** icon only (half-circle = Automatic, sun = Parchment, candle = Candlelight). Its accessible name says the current and next theme.
- **Toast:** a parchment popover pinned bottom-centre (above the phone tab bar), with a success tick, the message and a dismiss ×. It auto-hides after 5 s and is announced politely. Use toasts only for quick, reversible confirmations; errors stay inline next to the field.
- **Bottom sheet** (filters on < lg): rounded top, parchment, 85 vh max, a title and a × at the top, backdrop, Escape, focus kept inside.
- **Skeletons:** `skeleton` utility (pulse is off with reduced motion), in the shape of the real content.
- **Illustrations:** empty states use the tipped tankard, the 404 uses the natural-1 d20, and big page banners reuse the tavern hero with a dark wash on the left for text.

## Notice Board
- The board is an `.on-wood .wood-plank` panel with a brass border. Each note is `.parchment .notice`: square-ish corners, a drop shadow, a solid thumbtack at the top centre, and a stable tilt of −1.5° to +1.5° (`noticeTilt(id)`) that straightens on hover and focus.
- In dark mode, notes are a shade lighter than the oak (#33261a with a #7a5a38 edge) so they read as paper.
- "Looking for players" eyebrows use success green; "Looking for a group" uses the accent colour.
- **Header rule:** items never wrap (`whitespace-nowrap`). Anything new in the header must pass the width sweep (640–1536 px, signed-in GM/admin, EN + ID) or go icon-only.

## Typography
- **h1, h2, the wordmark and eyebrows:** **Cinzel** (`font-display`, `var(--font-heading)` in inline styles). It's an inscription face with small caps, like a tavern sign. Keep h1 ≤ 60 px, and use `font-extrabold` for heroes.
- **h3 and titles inside cards:** **Alegreya** (`font-serif`), a book serif.
- **UI and body:** **Alegreya Sans** (`font-sans`), a humanist sans that pairs with the serifs and stays legible at 12–14 px.
- **Eyebrow labels:** the `eyebrow` utility (Cinzel, 12 px, 0.18em tracking, muted).
- All three are self-hosted by `next/font` (no requests to Google at runtime). Cinzel and Alegreya are variable fonts, so don't pass `weight` (Turbopack build bug).

## Components (reuse; don't reinvent)
- **Utilities:** `btn-primary` · `btn-secondary` · `btn-ghost` · `btn-danger` · `card` · `input` · `label` · `chip` · `eyebrow`.
- **React components:**
  - `Avatar` (`image`) · `Stars` (needs `t`) · `Cover` (`image`, `wide` for full-bleed heroes) · `Thumb` (`image`) · `GameCard` (needs `t`)
  - `Notice` (`info` \| `success` \| `danger`, with an automatic icon) · `EmptyState` · `FieldError` · `VerifiedBadge`
  - `SubmitButton` (pending text) · `ConfirmButton` (use for anything destructive) · `LocalTime`
- **Filter pills** are real radio inputs, `sr-only` + `peer-checked:`. Keep them keyboard-accessible.

## Icons: Flaticon UIcons
- **Styles:** *regular rounded* (`<Icon name="…" />`) for UI, and *solid rounded* (`<Icon name="star" solid />`) for filled accents only: stars, the verified badge, the logo d20, the "booked" check.
- **Colour and size:** icons inherit `currentColor` and font size. Feature icons sit in a tinted tile: `flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent`.
- **Semantic map (keep it consistent):**

  | Concept | Icon |
  |---|---|
  | Brand / system | `dice-d20` |
  | GM | `hat-wizard` |
  | Search / find | `search` |
  | My games / sessions | `calendar-clock`, `calendar` |
  | One-shot | `book-open-cover` |
  | Campaign | `scroll-old` |
  | Online / in person | `laptop` / `marker` |
  | Play language | `language` |
  | Beginner / experienced | `seedling` / `graduation-cap` |
  | Book / reserve | `ticket` |
  | Payment | `wallet`, `handshake`, `percentage` (0% commission) |
  | Safety / content warnings | `shield-check` / `triangle-warning` |
  | Chat / reviews | `comments` / `star` |
  | Add / edit / view / archive / cancel | `plus` / `pencil` / `eye` / `archive` / `cross-circle` |

- **Accessibility:** icons are `aria-hidden` by default. Icon-only buttons need an `aria-label`. Meaningful standalone icons take `label`.
- **Attribution:** keep "Uicons by Flaticon" in the footer. It is required.

## Layout
- **Container:** `mx-auto max-w-6xl px-4`. **Grid:** cards in 1/2/3 columns. **Sidebars:** 260–360 px, sticky from `lg`.
- **Mobile-first:** the header collapses to icon-only below `sm`, and nothing may cause horizontal scroll at 360 px.
- **Spacing:** multiples of 4 px. **Radii:** `rounded-lg` for buttons and inputs, `rounded-xl` for cards, `rounded-full` for chips and avatars.

## Content & voice
| | English (default) | Bahasa Indonesia |
|---|---|---|
| Tone | friendly, direct | friendly informal (*kamu*), never stiff *Anda* |
| Money | `Rp 75.000` · "Free" | `Rp 75.000` · "Gratis" |
| Dates | "Sat, 26 Sept, 19:00 GMT+7" | "Sab, 26 Sep, 19.00 WIB" |

**Indonesian glossary** (decided by the product owner, a native speaker, 2026-09-25, and updated after their line-by-line review on 2026-09-26; use it for every new string):
| Concept | Use | Don't use |
|---|---|---|
| table (a game group) | **table** · *table-mu*, *table-nya* | meja |
| session | **session** · *session-mu* | sesi |
| campaign | **campaign** | kampanye |
| seat · to book one | **kursi** · **pesan kursi** / *memesan kursi* | seat, booking |
| message / chat | **chat** (*Chat baru dari…*, *Chat table*) | pesan (reserved for booking) |
| in person | **luring** (*Luring di Bandung*, *game luring*) | offline, tatap muka |
| link (URL) | **tautan** (*Salin tautan*, *Kirim tautan reset*) | link |
| deleted account | **Anonim** | Anonymous |
| Notice Board | **Papan Pengumuman Tavern** | Papan Pengumuman Kedai |
| beginner | **beginner** · *Beginner-friendly* | pemula |
| Hire a GM (feature) | **Cari GM** · *Cari Game Master* | Sewa GM |
| Game Master | **Game Master** / **GM** | — |
| game, one-shot, roleplay | English as-is | permainan, sekali main |
- English nouns take **-mu/-nya with a hyphen** (*table-mu*, *session-nya*, *GM-mu*, *game-mu*). Native words attach directly (*kursimu*, *gengmu*).

- **State the consequence of every action** in its confirmation, for example "Give up your seat? If you've already paid, arrange any refund with the GM."
- **Never imply the platform holds money.** Say "paid directly to the GM" / "dibayar langsung ke GM".
- **Indonesian runs 10–20% longer than English.** Layouts must wrap, not truncate, and must be checked in ID.
- **Playful touches only where stakes are low**, like the 404 page ("Natural 1."). Never in errors about money or safety.

## Accessibility checklist (WCAG 2.1 AA)
- `<html lang>` matches the UI language, and there is a skip link.
- Every input has a label, and errors sit next to their fields.
- Notices use `role=alert` / `role=status`.
- Focus rings stay visible, and text contrast is ≥ 4.5:1 in both themes.
- Colour is never the only signal: "Full" is written out, and the verified badge has a label.
