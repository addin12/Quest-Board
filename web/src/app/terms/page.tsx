import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/dict";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icon";

const SECTIONS = [1,2,3,4,5,6,7,8,9,10] as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("legal.terms.title") };
}

export default async function TermsPage() {
  const { t } = await getI18n();
  const contact = process.env.QUESTBOARD_CONTACT_EMAIL;
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="scale" className="text-accent" /> {t("legal.terms.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("legal.updated", { date: "25 Sep 2026" })}</p>
      {process.env.QUESTBOARD_LEGAL_FINAL !== "true" && <div className="mt-5"><Notice>{t("legal.draft")}</Notice></div>}
      <p className="mt-6 leading-relaxed">{t("legal.terms.intro")}</p>
      <ol className="mt-6 space-y-6">
        {SECTIONS.map((n) => (
          <li key={n} className="card p-5">
            <h2 className="text-lg font-bold">{n}. {t(`legal.terms.${n}.title` as MsgKey)}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{t(`legal.terms.${n}.body` as MsgKey)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm">
        {t("legal.contact")}{" "}
        {contact ? <a href={`mailto:${contact}`} className="font-semibold text-accent underline">{contact}</a> : <span className="text-muted">{t("legal.contactTbd")}</span>}
      </p>
      <p className="mt-2 text-sm"><Link href="/privacy" className="font-semibold text-accent underline">{t("legal.privacy.title")}</Link></p>
    </article>
  );
}
