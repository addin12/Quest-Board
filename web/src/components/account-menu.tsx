"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/app/actions";
import { Avatar } from "./ui";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

/**
 * The header's account button: the person's portrait and first name (not an unlabeled picture), opening
 * a short menu of full-word actions — Settings, the admin console for admins, and Log out.
 */
export function AccountMenu({ name, hue, image, admin }: { name: string; hue: number; image: string | null; admin: boolean }) {
  const { t } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  if (lastPath !== path) {
    setLastPath(path);
    setOpen(false); // navigating closes it
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const first = name.trim().split(/\s+/)[0] || name;
  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium hover:bg-surface-2";
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="btn-ghost gap-2 pl-1.5! pr-2.5!"
      >
        <Avatar name={name} hue={hue} image={image} size={30} />
        <span className="max-w-[9rem] truncate text-text max-sm:sr-only">{first}</span>
        <Icon name={open ? "angle-small-up" : "angle-small-down"} className="max-sm:hidden" />
        <span className="sr-only">{t("account.menu")}</span>
      </button>
      {open && (
        <div id={menuId} className="parchment popover absolute right-0 top-full z-50 mt-2 w-60 p-1.5">
          <p className="truncate px-3 pb-1.5 pt-1 text-xs text-muted">{name}</p>
          <Link href="/settings" className={item}><Icon name="settings" /> {t("settings.title")}</Link>
          {admin && <Link href="/admin" className={item}><Icon name="shield" /> {t("admin.title")}</Link>}
          <form action={logoutAction} className="mt-1 border-t border-border pt-1">
            <button type="submit" className={`${item} text-danger`}><Icon name="sign-out-alt" /> {t("nav.logout")}</button>
          </form>
        </div>
      )}
    </div>
  );
}
