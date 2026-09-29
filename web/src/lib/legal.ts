import type { MsgKey } from "./i18n/dict";

// Version of the Terms of Service + Privacy Policy that people agree to at sign-up.
// Bump it whenever either text changes materially (users.terms_version records which one they agreed
// to), and add a one-line summary below: signed-in people then see a "we've updated" banner once
// (users.legal_seen_version, components/legal-update-banner.tsx).
export const LEGAL_VERSION = "2026-09-29-draft";

/** What changed in each version, as shown in the banner. A version without an entry shows no banner. */
export const LEGAL_CHANGES: Partial<Record<string, MsgKey>> = {
  "2026-09-29-draft": "legal.change.2026-09-29",
};
