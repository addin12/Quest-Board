"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";
import type { RegularIcon } from "@/lib/icons";
import type { MsgKey } from "@/lib/i18n/core";

/** Bottom tab bar below `sm`: the header's page links live here on phones. */
export function MobileTabBar({ signedIn, isGm }: { signedIn: boolean; isGm: boolean }) {
  const { t } = useI18n();
  const path = usePathname();
  const tabs: { href: string; icon: RegularIcon; label: MsgKey; match: (p: string) => boolean }[] = [
    { href: "/games", icon: "search", label: "tab.find", match: (p) => p.startsWith("/games") },
    { href: "/browse", icon: "map", label: "tab.browse", match: (p) => p.startsWith("/browse") },
    { href: "/hire-a-gm", icon: "briefcase", label: "tab.hire", match: (p) => p.startsWith("/hire-a-gm") },
  ];
  if (signedIn) tabs.push({ href: "/dashboard", icon: "calendar-clock", label: "tab.mine", match: (p) => p.startsWith("/dashboard") });
  if (isGm) tabs.push({ href: "/gm", icon: "hat-wizard", label: "tab.gm", match: (p) => p === "/gm" || p.startsWith("/gm/") });
  else if (signedIn) tabs.push({ href: "/become-a-gm", icon: "hat-wizard", label: "tab.becomeGm", match: (p) => p.startsWith("/become-a-gm") });

  return (
    <nav aria-label={t("nav.tabs")} className="on-wood wood-plank fixed inset-x-0 bottom-0 z-40 border-t-2 border-[#8a6a3a] pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex">
        {tabs.map((tab) => {
          const active = tab.match(path);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium ${active ? "text-accent" : "text-muted hover:text-text"}`}
              >
                <Icon name={tab.icon} className="text-lg" />
                <span className="max-w-full truncate">{t(tab.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
