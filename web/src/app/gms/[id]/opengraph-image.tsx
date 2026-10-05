import { getGmProfile } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { splitList } from "@/lib/policy";
import { OG_SIZE, clip, ogCard } from "@/lib/og-card";
import { ogPortrait } from "@/lib/og-portrait";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Quest Board Game Master";

/** Link preview for a GM's profile (shared on WhatsApp or Discord): portrait, name, headline, systems, rating. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getI18n();
  const gm = getGmProfile(Number(id));
  if (!gm) return ogCard({ eyebrow: t("og.eyebrow"), title: t("meta.title"), lines: [t("meta.description")] });
  const systems = splitList(gm.systems).slice(0, 3).join(" · ");
  return ogCard({
    eyebrow: gm.verified ? t("common.verifiedGm") : t("og.gmEyebrow"),
    title: clip(gm.name, 40),
    lines: [gm.headline && clip(gm.headline, 60), systems && clip(systems, 60)].filter(Boolean) as string[],
    hue: gm.avatar_hue,
    avatar: { src: (await ogPortrait(gm.avatar_image)) ?? undefined, initial: (gm.name.trim()[0] ?? "?").toUpperCase(), hue: gm.avatar_hue },
    badge: gm.review_count > 0 && gm.avg_rating ? t("og.gmRating", { rating: gm.avg_rating.toFixed(1) }) : t("og.badge"),
  });
}
