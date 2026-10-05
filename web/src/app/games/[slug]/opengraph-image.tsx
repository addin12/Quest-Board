import { getGameBySlug } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { formatIdr } from "@/lib/policy";
import { OG_SIZE, clip, ogCard } from "@/lib/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Quest Board game";

/** Link preview for a game (WhatsApp, Discord, X…): title, system, GM, where, price. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getI18n();
  const g = getGameBySlug(slug);
  if (!g || g.status !== "published") {
    return ogCard({ eyebrow: t("og.eyebrow"), title: t("meta.title"), lines: [t("meta.description")] });
  }
  const where = g.location_type === "online" ? t("loc.online") : `${t("loc.inPerson")} · ${g.city}`;
  return ogCard({
    eyebrow: g.system,
    title: g.title,
    lines: [`GM ${g.gm_name} · ${where}`, clip(g.summary, 90)],
    hue: g.cover_hue,
    badge: g.price_idr === 0 ? t("common.free") : `${formatIdr(g.price_idr)} / ${t("common.session")}`,
  });
}
