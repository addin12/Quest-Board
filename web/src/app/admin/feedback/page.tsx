import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { db } from "@/lib/db";
import { adminStats } from "@/lib/moderation";
import { markFeedbackDoneAction } from "@/app/actions";
import { EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icon";
import { AdminNav } from "../admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.feedback"), robots: { index: false } };
}

type Row = { id: number; kind: "bug" | "idea" | "other"; body: string; page: string; email: string; status: string; created_at: string; name: string | null; user_email: string | null };

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const { t } = await getI18n();
  const rows = db()
    .prepare(
      `SELECT f.id, f.kind, f.body, f.page, f.email, f.status, f.created_at, u.name, u.email AS user_email
         FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY (f.status = 'done'), f.created_at DESC LIMIT 200`,
    )
    .all() as Row[];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("admin.feedback")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("admin.feedbackLead")}</p>
      <AdminNav t={t} current="feedback" openReports={adminStats().openReports} />
      {rows.length === 0 ? (
        <EmptyState title={t("admin.feedbackEmpty")} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={`card p-4 ${r.status === "done" ? "opacity-60" : ""}`}>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="chip">{t(`feedback.kind.${r.kind}`)}</span>
                <LocalTime iso={r.created_at} />
                <span>{r.name ? shownName(r.name, t) : t("admin.feedbackAnon")}</span>
                {(r.user_email || r.email) && <a href={`mailto:${r.user_email || r.email}`} className="text-accent hover:underline">{r.user_email || r.email}</a>}
                {r.page && <span className="font-mono">{r.page}</span>}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm">{r.body}</p>
              <form action={markFeedbackDoneAction} className="mt-3">
                <input type="hidden" name="feedbackId" value={r.id} />
                <input type="hidden" name="done" value={r.status === "done" ? "0" : "1"} />
                <SubmitButton className="btn-secondary px-3! py-1! text-xs!"><Icon name={r.status === "done" ? "arrow-left" : "check"} /> {t(r.status === "done" ? "admin.feedbackReopen" : "admin.feedbackDone")}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
