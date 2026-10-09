// Search-engine helpers: schema.org structured data for game pages. Pure module (no imports
// of server code) so node --test can load it.

export type EventGame = {
  slug: string;
  title: string;
  summary: string;
  system: string;
  location_type: "online" | "in_person";
  city: string;
  /** v39: where an in-person game meets (a café, a store) and its Google Maps link, both public on the game page. */
  venue_name?: string;
  venue_maps_url?: string;
  price_idr: number;
  seats_total: number;
  cover_image: string | null;
  gm_id: number;
  gm_name: string;
};

export type EventSession = { id: number; starts_at: string; duration_minutes: number; seats_taken: number; seats_held: number };

/**
 * One schema.org `Event` per upcoming session, so search engines can show dates, price and
 * availability. Only what the game page shows everyone: the venue's name and map link for in-person games
 * (never a street address typed by hand), never the GM's payment info.
 */
export function gameEventsJsonLd(game: EventGame, sessions: EventSession[], origin: string): object[] {
  const url = `${origin}/games/${game.slug}`;
  const online = game.location_type === "online";
  return sessions.slice(0, 10).map((s) => {
    const end = new Date(new Date(s.starts_at).getTime() + s.duration_minutes * 60_000).toISOString();
    const left = Math.max(0, game.seats_total - s.seats_taken - s.seats_held);
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: game.title,
      description: game.summary,
      startDate: s.starts_at,
      endDate: end,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
      location: online
        ? { "@type": "VirtualLocation", url }
        : {
            "@type": "Place",
            name: game.venue_name || game.city,
            address: { "@type": "PostalAddress", addressLocality: game.city, addressCountry: "ID" },
            ...(game.venue_name && game.venue_maps_url ? { hasMap: game.venue_maps_url } : {}),
          },
      ...(game.cover_image ? { image: [`${origin}${game.cover_image}`] } : {}),
      organizer: { "@type": "Person", name: game.gm_name, url: `${origin}/gms/${game.gm_id}` },
      offers: {
        "@type": "Offer",
        url, // the public game page; booking itself needs an account
        price: game.price_idr,
        priceCurrency: "IDR",
        availability: left > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      },
      maximumAttendeeCapacity: game.seats_total,
      remainingAttendeeCapacity: left,
      keywords: game.system,
    };
  });
}

/** JSON for a <script type="application/ld+json">, safe against "</script>" in user text. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Paths that are private or per-user and should never be indexed. */
export const NO_INDEX_PATHS = [
  "/api/", "/admin", "/dashboard", "/gm/", "/settings", "/book/", "/notifications", "/dev",
  "/hire-a-gm/request", "/reset-password", "/verify-email", "/forgot-password", "/questions",
];

/** Strip a /en or /id language prefix: "/id/games/x" → "/games/x", "/en" → "/". */
export function unprefixedPath(path: string): string {
  return path.replace(/^\/(en|id)(?=\/|$)/, "") || "/";
}

/** The language URL of a path: ("/games/x", "id") → "/id/games/x"; ("/", "en") → "/en". */
export function localizedPath(path: string, lang: "en" | "id"): string {
  return `/${lang}${path === "/" ? "" : path}`;
}

/**
 * canonical + hreflang for a public page: the canonical URL is the language URL of what's
 * being shown; both languages are listed as alternates, and the unprefixed URL (cookie
 * language, English by default) is x-default. Private pages get none.
 */
export function languageAlternates(rawPath: string, lang: "en" | "id") {
  const path = unprefixedPath(rawPath);
  if (NO_INDEX_PATHS.some((p) => path.startsWith(p))) return undefined;
  return {
    canonical: localizedPath(path, lang),
    languages: { en: localizedPath(path, "en"), id: localizedPath(path, "id"), "x-default": path },
  };
}

/** robots.txt disallow list, including the language-prefixed variants. */
export function disallowedPaths(): string[] {
  return NO_INDEX_PATHS.flatMap((p) => [p, `/en${p}`, `/id${p}`]);
}
