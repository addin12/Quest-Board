import { countGames, searchGames, type GameFilters } from "@/lib/queries";

// Public read-only JSON API — see docs/06-api-spec.md. Prices are whole IDR.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const sort = p.get("sort");
  const filters: GameFilters = {
    q: p.get("q")?.slice(0, 80) || undefined,
    system: p.get("system") || undefined,
    format: p.get("format") || undefined,
    location: p.get("location") || undefined,
    language: p.get("language") || undefined,
    level: p.get("level") || undefined,
    city: p.get("city")?.slice(0, 60) || undefined,
    mechanic: p.get("mechanic") || undefined,
    maxPrice: p.get("maxPrice") ? Number(p.get("maxPrice")) : undefined,
    free: p.get("free") === "1",
    sort: (["soonest", "price_asc", "price_desc", "rating", "newest"] as const).find((s) => s === sort) ?? "soonest",
  };
  const limit = Math.min(100, Math.max(1, Number(p.get("limit")) || 30));
  const offset = Math.min(10_000, Math.max(0, Math.floor(Number(p.get("offset"))) || 0));
  const games = searchGames(filters, limit, offset).map((g) => ({
    id: g.id,
    slug: g.slug,
    title: g.title,
    system: g.system,
    summary: g.summary,
    format: g.format,
    locationType: g.location_type,
    language: g.language,
    city: g.city || null,
    price: { amount: g.price_idr, currency: "IDR" },
    coverImage: g.cover_image || null,
    seatsTotal: g.seats_total,
    experienceLevel: g.experience_level,
    tags: g.tags ? g.tags.split(",").map((t) => t.trim()) : [],
    gm: { id: g.gm_id, name: g.gm_name, verified: !!g.gm_verified },
    rating: g.avg_rating,
    reviewCount: g.review_count,
    nextSession: g.next_session_id
      ? { id: g.next_session_id, startsAt: g.next_session_at, seatsLeft: g.seats_total - (g.next_session_seats_taken ?? 0) }
      : null,
    url: `/games/${g.slug}`,
  }));
  return Response.json({ data: games, count: games.length, total: countGames(filters), offset });
}
