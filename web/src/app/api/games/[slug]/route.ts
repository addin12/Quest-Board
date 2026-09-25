import { getGameBySlug, listSessions } from "@/lib/queries";

export async function GET(_: Request, ctx: RouteContext<"/api/games/[slug]">) {
  const { slug } = await ctx.params;
  const g = getGameBySlug(slug);
  if (!g || g.status !== "published") return Response.json({ error: "not_found" }, { status: 404 });
  const sessions = listSessions(g.id, { upcomingOnly: true }).map((s) => ({
    id: s.id,
    startsAt: s.starts_at,
    durationMinutes: s.duration_minutes,
    seatsLeft: g.seats_total - s.seats_taken,
  }));
  // The GM's payment details are deliberately NOT exposed here (members-only on the site).
  return Response.json({
    data: {
      id: g.id,
      slug: g.slug,
      title: g.title,
      system: g.system,
      summary: g.summary,
      description: g.description,
      format: g.format,
      locationType: g.location_type,
      language: g.language,
      platform: g.platform || null,
      city: g.city || null,
      price: { amount: g.price_idr, currency: "IDR" },
      coverImage: g.cover_image || null,
      seatsTotal: g.seats_total,
      experienceLevel: g.experience_level,
      minAge: g.min_age,
      contentWarnings: g.content_warnings,
      safetyTools: g.safety_tools,
      gm: { id: g.gm_id, name: g.gm_name, headline: g.gm_headline, verified: !!g.gm_verified },
      rating: g.avg_rating,
      reviewCount: g.review_count,
      sessions,
    },
  });
}
