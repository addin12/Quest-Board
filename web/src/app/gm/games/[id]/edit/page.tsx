import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { notFound } from "next/navigation";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getGameById } from "@/lib/queries";
import { SYSTEMS } from "@/lib/validation";
import { formatIdr } from "@/lib/policy";
import { GameForm } from "@/components/game-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("manage.editDetails") };
}

export default async function EditGamePage(props: PageProps<"/gm/games/[id]/edit">) {
  const gm = await requireGm();
  const { t } = await getI18n();
  const { id } = await props.params;
  const g = getGameById(Number(id));
  if (!g || (g.gm_id !== gm.id && !gm.admin) || g.status === "archived") notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/gm/games/${g.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("manage.backToGame")}</Link>
      <h1 className="mt-2 mb-8 text-3xl font-bold">{t("manage.editTitle", { title: g.title })}</h1>
      <GameForm
        systems={SYSTEMS}
        defaults={{
          id: g.id,
          title: g.title,
          system: g.system,
          summary: g.summary,
          description: g.description,
          format: g.format,
          locationType: g.location_type,
          language: g.language,
          platform: g.platform,
          tableLink: g.table_link,
          city: g.city,
          venueName: g.venue_name,
          venueMapsUrl: g.venue_maps_url,
          price: formatIdr(g.price_idr).replace(/^Rp\s*/, ""),
          seatsTotal: String(g.seats_total),
          experienceLevel: g.experience_level,
          minAge: String(g.min_age),
          contentWarnings: g.content_warnings,
          safetyTools: g.safety_tools,
          tags: g.tags,
          coverHue: g.cover_hue,
          coverImage: g.cover_image,
          genres: g.genres,
          styles: g.styles,
          status: g.status,
        }}
      />
    </div>
  );
}
