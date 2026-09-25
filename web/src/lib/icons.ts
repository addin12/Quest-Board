// Registry of Flaticon UIcons used by Quest Board (https://www.flaticon.com/uicons).
// Only these glyphs are shipped: `npm run icons` subsets the UIcons fonts to this
// list and writes src/app/icons/. Add a name here, then re-run `npm run icons`.
// Pure module (no imports) so the generator script and node --test can load it.

/** Regular-rounded style (`fi-rr-*`). */
export const REGULAR_ICONS = [
  "share", "link-alt", "download",
  "bell",
  "search", "dice-d20", "hat-wizard", "calendar-clock", "calendar", "calendar-plus", "users", "user", "user-add",
  "globe", "language", "laptop", "marker", "book-open-cover", "scroll-old", "seedling", "graduation-cap", "clock",
  "ticket", "comments", "star", "shield-check", "triangle-warning", "wallet", "sign-in-alt", "sign-out-alt",
  "arrow-right", "arrow-left", "plus", "pencil", "eye", "archive", "check", "check-circle", "cross-circle", "info",
  "filter", "sparkles", "crown", "percentage", "coins", "handshake", "dragon", "paper-plane", "sort-alt",
  "hourglass-end", "magic-wand", "exclamation",
  // categories (genres & styles)
  "skull", "ghost", "rocket", "bolt", "fingerprint", "radiation", "city", "castle", "campfire",
  "theater-masks", "sword", "chess", "brain", "map", "puzzle", "axe", "feather",
  // settings & hire-a-GM
  "settings", "user-pen", "key", "lock", "inbox", "briefcase", "family", "party-horn", "clipboard-list",
  "comment-dots", "hand-wave", "users-alt",
] as const;

/** Solid-rounded style (`fi-sr-*`) for filled accents. */
export const SOLID_ICONS = ["star", "badge-check", "dice-d20", "check-circle"] as const;

/** Brand logos (`fi-brands-*`), e.g. share targets. */
export const BRAND_ICONS = ["whatsapp"] as const;

export type RegularIcon = (typeof REGULAR_ICONS)[number];
export type SolidIcon = (typeof SOLID_ICONS)[number];
export type BrandIcon = (typeof BRAND_ICONS)[number];
