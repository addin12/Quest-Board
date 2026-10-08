import { getI18n } from "@/lib/i18n/server";
import { OG_SIZE, ogCard } from "@/lib/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Quest Board";

/** Default link preview for every page without its own. */
export default async function Image() {
  const { t } = await getI18n();
  return ogCard({ eyebrow: t("og.eyebrow"), title: t("home.title1") + " " + t("home.title2"), lines: [t("meta.description")] });
}
