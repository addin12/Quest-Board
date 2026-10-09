import { getGameBySlug } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { formatIdr } from "@/lib/policy";
import { OG_SIZE, clip, ogCard } from "@/lib/og-card";
import { ogCover } from "@/lib/og-portrait";
import { ogCached } from "@/lib/og-cache";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Quest Board game";

/** Link preview for a game (WhatsApp, Discord, X…): its poster, then title, system, GM, where, price. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getI18n();
  const g = getGameBySlug(slug);
  if (!g || g.status !== "published") {
    const card = { eyebrow: t("og.eyebrow"), title: t("meta.title"), lines: [t("meta.description")] };
    return ogCached(card, () => ogCard(card));
  }
  const where = g.location_type === "online" ? t("loc.online") : `${t("loc.inPerson")} · ${g.city}`;
  const card = {
    eyebrow: g.system,
    title: clip(g.title, 60),
    lines: [`GM ${g.gm_name}`, where, clip(g.summary, 80)],
    hue: g.cover_hue,
    badge: g.price_idr === 0 ? t("common.free") : `${formatIdr(g.price_idr)} / ${t("common.session")}`,
  };
  // Drawn again only when something on it changes (its text, colour or cover): lib/og-cache.ts.
  return ogCached({ ...card, cover: g.cover_image }, async () =>
    ogCard({ ...card, poster: { src: (await ogCover(g.cover_image)) ?? undefined, hue: g.cover_hue } }),
  );
}
