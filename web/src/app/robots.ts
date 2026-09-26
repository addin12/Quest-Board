import type { MetadataRoute } from "next";
import { NO_INDEX_PATHS } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/** robots.txt: index the public marketplace, keep private and per-user pages out. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return { rules: { userAgent: "*", allow: "/", disallow: NO_INDEX_PATHS }, sitemap: `${origin}/sitemap.xml` };
}
