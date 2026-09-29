import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import type { T } from "@/lib/i18n/dict";
import { LEGAL_CHANGES, LEGAL_VERSION } from "@/lib/legal";
import { dismissLegalUpdateAction } from "@/app/actions";
import { Icon } from "./icon";

/** "We've updated our Privacy Policy: …" — once per version, for signed-in people (lib/legal.ts). */
export function LegalUpdateBanner({ user, t }: { user: CurrentUser; t: T }) {
  const change = LEGAL_CHANGES[LEGAL_VERSION];
  if (!change || user.legal_seen_version === LEGAL_VERSION) return null;
  return (
    <aside aria-label={t("legalUpdate.label")} className="border-b border-border bg-surface-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
        <p className="flex min-w-0 flex-1 items-start gap-2"><Icon name="info" className="mt-0.5 shrink-0 text-accent" /> <span>{t("legalUpdate.text", { summary: t(change) })}</span></p>
        <span className="flex shrink-0 items-center gap-3">
          <Link href="/privacy" className="font-semibold text-accent hover:underline">{t("legalUpdate.read")}</Link>
          <form action={dismissLegalUpdateAction}><button className="btn-secondary px-3! py-1! text-xs!">{t("legalUpdate.ok")}</button></form>
        </span>
      </div>
    </aside>
  );
}
