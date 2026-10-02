import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth";
import { peekGmInvite } from "@/lib/gm-invites";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/submit-button";
import { ResendVerificationButton } from "@/components/account-forms";
import { acceptGmInviteAction } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("invite.title"), robots: { index: false } };
}

/** A founding-GM invitation (Admin → GMs). Accepting takes a click, signed in with a confirmed email. */
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const { t } = await getI18n();
  const invite = peekGmInvite(token);
  const user = await getCurrentUser();
  const here = `/invite/${encodeURIComponent(token)}`;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("invite.title")}</h1>
      {!invite ? (
        <div className="mt-6"><Notice tone="danger">{t("invite.invalid")}</Notice></div>
      ) : (
        <div className="mt-6 space-y-5">
          <p>{t("invite.lead", { admin: invite.inviter || "Quest Board" })}</p>
          {!user ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/signup?role=gm&next=${encodeURIComponent(here)}`} className="btn-primary">{t("invite.signup")}</Link>
              <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn-secondary">{t("invite.login")}</Link>
            </div>
          ) : !user.email_verified ? (
            <div className="space-y-3">
              <Notice tone="info">{t("invite.confirmFirst")}</Notice>
              <ResendVerificationButton />
            </div>
          ) : (
            <form action={acceptGmInviteAction} className="space-y-3">
              <input type="hidden" name="token" value={token} />
              <SubmitButton className="btn-primary w-full py-3!"><Icon name="badge-check" /> {t("invite.accept")}</SubmitButton>
              <p className="text-xs text-muted">{t("invite.twoStepNote")}</p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
