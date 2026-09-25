import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getGmProfile } from "@/lib/queries";
import { SYSTEMS } from "@/lib/validation";
import { GmRequestForm } from "@/components/hire-forms";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("hire.requestPageTitle") };
}

export default async function RequestGmPage(props: PageProps<"/hire-a-gm/request">) {
  const { gm: gmParam } = await props.searchParams;
  const gmId = Number(Array.isArray(gmParam) ? gmParam[0] : gmParam) || 0;
  await requireUser(`/hire-a-gm/request${gmId ? `?gm=${gmId}` : ""}`);
  const { t } = await getI18n();
  const gm = gmId ? getGmProfile(gmId) : undefined;

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 lg:grid-cols-[1fr_300px]">
      <div>
        <Link href="/hire-a-gm" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("hire.title")}</Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold"><Icon name="briefcase" className="text-accent" /> {t("hire.requestPageTitle")}</h1>
        <p className="mt-1 mb-8 text-muted">{gm ? t("hire.requestLeadDirect", { name: gm.name }) : t("hire.requestLead")}</p>
        <div className="card p-6">
          <GmRequestForm systems={SYSTEMS} gm={gm ? { id: gm.id, name: gm.name } : undefined} />
        </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
        {gm && (
          <div className="card flex items-center gap-3 p-4">
            <Avatar name={gm.name} hue={gm.avatar_hue} image={gm.avatar_image} size={48} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{gm.name}</p>
              <p className="truncate text-xs text-muted">{gm.headline}</p>
            </div>
          </div>
        )}
        <div className="card p-5">
          <h2 className="eyebrow">{t("hire.howTitle")}</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {(["hire.how1", "hire.how2", "hire.how3", "hire.how4"] as const).map((k, i) => (
              <li key={k} className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
