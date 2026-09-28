import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getNotice } from "@/lib/community";
import { SYSTEMS } from "@/lib/validation";
import { NoticeForm } from "@/components/board-forms";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("board.editTitle") };
}

/** The author edits their open notice. */
export default async function EditNoticePage(props: PageProps<"/board/[id]/edit">) {
  const { id } = await props.params;
  const user = await requireUser(`/board/${id}/edit`);
  const { t } = await getI18n();
  const n = getNotice(Number(id));
  if (!n || n.author_id !== user.id || n.status !== "open") notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/board/${n.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {n.title}</Link>
      <h1 className="mt-2 mb-6 flex items-center gap-2 text-3xl font-bold"><Icon name="pencil" className="text-accent" /> {t("board.editTitle")}</h1>
      <div className="card p-6">
        <NoticeForm
          systems={SYSTEMS}
          existing={{
            id: n.id, kind: n.kind, title: n.title, system: n.system, locationType: n.location_type, city: n.city,
            language: n.language, schedule: n.schedule, spots: String(n.spots || 2), body: n.body,
          }}
        />
      </div>
    </div>
  );
}
