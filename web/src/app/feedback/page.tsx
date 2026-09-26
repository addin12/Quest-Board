import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { isSafeNext } from "@/lib/policy";
import { Icon } from "@/components/icon";
import { FeedbackForm } from "@/components/feedback-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("feedback.title") };
}

/** "Send feedback": bugs, ideas and anything else, for the team running Quest Board. */
export default async function FeedbackPage(props: PageProps<"/feedback">) {
  const { t } = await getI18n();
  const user = await getCurrentUser();
  const from = (await props.searchParams).from;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="comment" className="text-accent" /> {t("feedback.title")}</h1>
      <p className="mt-2 text-muted">{t("feedback.lead")}</p>
      <div className="card mt-6 p-6"><FeedbackForm signedIn={!!user} from={isSafeNext(from) ? from : ""} /></div>
    </div>
  );
}
