import type { MetadataRoute } from "next";
import { listSystemsInUse, sitemapEntries } from "@/lib/queries";
import { GENRES, STYLES, systemSlug } from "@/lib/categories";
import { siteOrigin } from "@/lib/site";

// Rendered per request: the list changes whenever a GM publishes a game.
export const dynamic = "force-dynamic";

/** sitemap.xml: public pages, every published game, listed GMs and category pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const { games, gms } = sitemapEntries();
  const fixed = ["/", "/games", "/browse", "/hire-a-gm", "/board", "/quiz", "/how-it-works", "/become-a-gm", "/terms", "/privacy"];
  return [
    ...fixed.map((p) => ({ url: `${origin}${p}`, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 })),
    ...games.map((g) => ({ url: `${origin}/games/${g.slug}`, lastModified: g.created_at, changeFrequency: "daily" as const, priority: 0.9 })),
    ...gms.map((g) => ({ url: `${origin}/gms/${g.id}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...listSystemsInUse().map((s) => ({ url: `${origin}/browse/system/${systemSlug(s.system)}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...GENRES.map((g) => ({ url: `${origin}/browse/genre/${g.key}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...STYLES.map((s) => ({ url: `${origin}/browse/style/${s.key}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
