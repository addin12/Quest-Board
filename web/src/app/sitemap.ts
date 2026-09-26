import type { MetadataRoute } from "next";
import { listSystemsInUse, sitemapEntries } from "@/lib/queries";
import { GENRES, MECHANICS, STYLES, systemSlug } from "@/lib/categories";
import { localizedPath } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

// Rendered per request: the list changes whenever a GM publishes a game.
export const dynamic = "force-dynamic";

type Page = { path: string; changeFrequency: "daily" | "weekly"; priority: number; lastModified?: string };

/** sitemap.xml: every public page in both languages (/en/…, /id/…), each listing its alternate. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const { games, gms } = sitemapEntries();
  const fixed = ["/", "/games", "/browse", "/hire-a-gm", "/board", "/quiz", "/how-it-works", "/become-a-gm", "/terms", "/privacy"];
  const pages: Page[] = [
    ...fixed.map((path) => ({ path, changeFrequency: "daily" as const, priority: path === "/" ? 1 : 0.7 })),
    ...games.map((g) => ({ path: `/games/${g.slug}`, lastModified: g.created_at, changeFrequency: "daily" as const, priority: 0.9 })),
    ...gms.map((g) => ({ path: `/gms/${g.id}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...listSystemsInUse().map((s) => ({ path: `/browse/system/${systemSlug(s.system)}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...GENRES.map((g) => ({ path: `/browse/genre/${g.key}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...STYLES.map((s) => ({ path: `/browse/style/${s.key}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...MECHANICS.map((m) => ({ path: `/browse/mechanic/${m.key}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
  const languages = (path: string) => ({ en: origin + localizedPath(path, "en"), id: origin + localizedPath(path, "id") });
  return pages.flatMap(({ path, ...rest }) =>
    (["en", "id"] as const).map((lang) => ({ url: origin + localizedPath(path, lang), ...rest, alternates: { languages: languages(path) } })),
  );
}
