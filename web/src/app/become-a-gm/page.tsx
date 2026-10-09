import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getGmSettings } from "@/lib/queries";
import { BecomeGmForm } from "@/components/become-gm-form";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/ui";
import { verifiedGmNeedsTwoStep } from "@/lib/two-step";
import { JsonLd } from "@/components/json-ld";
import { webPageJsonLd } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.becomeGm") };
}

export default async function BecomeGmPage() {
  const user = await getCurrentUser();
  const { t } = await getI18n();
  const profile = user ? getGmSettings(user.id) : undefined;
  const needsTwoStep = !!user && verifiedGmNeedsTwoStep(user.id);
  const origin = await siteOrigin();

  return (
    <>
    <JsonLd data={webPageJsonLd({ name: t("nav.becomeGm"), description: t("meta.description"), url: `${origin}/become-a-gm` })} />
    <section className="on-wood relative overflow-hidden border-b-2 border-[#8a6a3a] bg-[#1b1008]">
      <Image src="/images/tavern/hero.svg" alt="" fill priority sizes="100vw" className="object-cover object-[75%_center] opacity-70" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-r from-[#140b05]/95 via-[#140b05]/75 to-[#140b05]/30" />
      <div className="relative mx-auto max-w-5xl px-4 py-14">
        <p className="eyebrow flex items-center gap-2 text-accent!"><Icon name="hat-wizard" /> {t("becomeGm.eyebrow")}</p>
        <span aria-hidden className="ornament mt-3 w-40!" />
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold">{t("becomeGm.title")}</h1>
      </div>
    </section>
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-12 md:grid-cols-2">
      <div>
        <ul className="mt-6 space-y-4">
          {([
            ["coins", "becomeGm.b1Title", "becomeGm.b1Body"],
            ["percentage", "becomeGm.b2Title", "becomeGm.b2Body"],
            ["users", "becomeGm.b3Title", "becomeGm.b3Body"],
            ["shield-check", "becomeGm.b4Title", "becomeGm.b4Body"],
          ] as const).map(([icon, title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
              <span><strong>{t(title)}.</strong> <span className="text-muted">{t(body)}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-6">
        {user ? (
          <>
            <h2 className="text-xl font-bold">{user.role === "gm" ? t("becomeGm.editTitle") : t("becomeGm.createTitle")}</h2>
            <p className="mb-5 text-sm text-muted">{t("becomeGm.formLead")}</p>
            {needsTwoStep ? (
              // First things first: saving needs two-step login, so don't let them fill in a form (and pick a
              // QRIS picture) only to be refused. Settings brings them straight back here afterwards.
              <div className="space-y-4" data-testid="two-step-first">
                <Notice tone="danger">{t("gm.twoStepRequired")}</Notice>
                <Link href={`/settings?next=${encodeURIComponent("/become-a-gm")}#two-step`} className="btn-primary"><Icon name="shield-check" /> {t("gm.twoStepRequiredLink")}</Link>
                <p className="text-sm text-muted">{t("gm.twoStepThen")}</p>
              </div>
            ) : (
            <BecomeGmForm
              defaults={{
                headline: profile?.headline ?? "",
                systems: profile?.systems ?? "",
                years: profile?.years_experience ?? 0,
                location: profile?.location ?? "Online",
                bio: profile?.bio ?? "",
                paymentInfo: profile?.payment_info ?? "",
                refundTerms: profile?.refund_terms ?? "",
                hasQr: !!profile?.payment_qr,
                avatarImage: profile?.avatar_image ?? "",
                name: profile?.name ?? user.name,
                hue: profile?.avatar_hue ?? user.avatar_hue,
              }}
            />
            )}
          </>
        ) : (
          <div className="flex h-full flex-col justify-center gap-4 text-center">
            <h2 className="text-xl font-bold">{t("becomeGm.startFree")}</h2>
            <Link href="/signup?role=gm" className="btn-primary"><Icon name="user-add" /> {t("becomeGm.signupGm")}</Link>
            <Link href="/login?next=/become-a-gm" className="btn-secondary"><Icon name="sign-in-alt" /> {t("becomeGm.haveAccount")}</Link>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
