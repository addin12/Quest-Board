import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getGmSettings } from "@/lib/queries";
import { BecomeGmForm } from "@/components/become-gm-form";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.becomeGm") };
}

export default async function BecomeGmPage() {
  const user = await getCurrentUser();
  const { t } = await getI18n();
  const profile = user ? getGmSettings(user.id) : undefined;

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-12 md:grid-cols-2">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-accent"><Icon name="hat-wizard" /> {t("becomeGm.eyebrow")}</p>
        <h1 className="mt-2 text-4xl font-bold">{t("becomeGm.title")}</h1>
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
            <BecomeGmForm
              defaults={{
                headline: profile?.headline ?? "",
                systems: profile?.systems ?? "",
                years: profile?.years_experience ?? 0,
                location: profile?.location ?? "Online",
                bio: profile?.bio ?? "",
                paymentInfo: profile?.payment_info ?? "",
                avatarImage: profile?.avatar_image ?? "",
                name: profile?.name ?? user.name,
                hue: profile?.avatar_hue ?? user.avatar_hue,
              }}
            />
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
  );
}
