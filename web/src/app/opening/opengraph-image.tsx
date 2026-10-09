import { countGames } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { isPrelaunch } from "@/lib/prelaunch";
import { OG_SIZE, ogCard } from "@/lib/og-card";
import { ogCached } from "@/lib/og-cache";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Quest Board is opening soon";

/** Link preview for the "opening soon" page — the link passed around during pre-launch. */
export default async function Image() {
  const { t } = await getI18n();
  const n = isPrelaunch() ? countGames({}) : 0;
  const card = !isPrelaunch()
    ? { eyebrow: t("og.eyebrow"), title: t("prelaunch.open"), lines: [t("meta.description")] }
    : { eyebrow: t("og.openingEyebrow"), title: n === 0 ? t("meta.title") : t(n === 1 ? "og.openingGamesOne" : "og.openingGames", { n }), lines: [t("og.openingLine")] };
  return ogCached(card, () => ogCard(card));
}
