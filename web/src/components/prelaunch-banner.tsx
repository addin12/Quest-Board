import Link from "next/link";
import type { T } from "@/lib/i18n/dict";
import { Icon } from "./icon";

/** Pre-launch mode (lib/prelaunch.ts): "opening soon", for everyone. */
export function PrelaunchBanner({ t }: { t: T }) {
  return (
    <aside aria-label={t("prelaunch.title")} className="border-b border-border bg-accent-soft" data-testid="prelaunch-banner">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
        <p className="flex min-w-0 flex-1 items-start gap-2"><Icon name="hat-wizard" className="mt-0.5 shrink-0 text-accent" /> <span>{t("prelaunch.banner")}</span></p>
        <span className="flex shrink-0 items-center gap-3">
          <Link href="/opening" className="font-semibold text-accent hover:underline">{t("prelaunch.notifyLink")}</Link>
          <Link href="/become-a-gm" className="text-muted hover:underline">{t("prelaunch.gmLink")}</Link>
        </span>
      </div>
    </aside>
  );
}
