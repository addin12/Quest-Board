// Search-engine helpers: schema.org structured data for game pages. Pure module (no imports
// of server code) so node --test can load it.

export type EventGame = {
  slug: string;
  title: string;
  summary: string;
  system: string;
  location_type: "online" | "in_person";
  city: string;
  price_idr: number;
  seats_total: number;
  cover_image: string | null;
  gm_id: number;
  gm_name: string;
};

export type EventSession = { id: number; starts_at: string; duration_minutes: number; seats_taken: number; seats_held: number };

/**
 * One schema.org `Event` per upcoming session, so search engines can show dates, price and
 * availability. Only public details: never the venue address or the GM's payment info.
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
        : { "@type": "Place", name: game.city, address: { "@type": "PostalAddress", addressLocality: game.city, addressCountry: "ID" } },
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
  "/hire-a-gm/request", "/reset-password", "/verify-email", "/forgot-password",
];
