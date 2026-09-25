"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

/**
 * On phones and tablets (< lg) the filters live in a bottom sheet opened from a
 * "Filters (n)" button; on desktop they render inline as before. The form inside is
 * the same server-rendered GET form, so submitting reloads the page (and closes the sheet).
 */
export function FilterSheet({ active, children }: { active: number; children: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        opener.current?.focus();
        return;
      }
      // Keep Tab inside the sheet while it is open (modal dialog pattern).
      if (e.key === "Tab" && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
        const list = [...focusable].filter((el) => el.offsetParent !== null);
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={id}
        className="btn-secondary w-full lg:hidden"
      >
        <Icon name="filter" /> {active > 0 ? t("filters.buttonActive", { n: active }) : t("filters.button")}
      </button>
      {open && <div aria-hidden className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div
        id={id}
        ref={panel}
        tabIndex={-1}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={t("browse.filters")}
        className={`parchment outline-none max-lg:fixed max-lg:inset-x-0 max-lg:bg-surface max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[85vh] max-lg:overflow-y-auto max-lg:rounded-t-xl max-lg:shadow-2xl max-lg:transition-transform ${
          open ? "max-lg:translate-y-0" : "max-lg:invisible max-lg:translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-4 lg:hidden">
          <p className="text-lg font-bold" style={{ fontFamily: "var(--font-heading)" }}>{t("browse.filters")}</p>
          <button type="button" onClick={() => { setOpen(false); opener.current?.focus(); }} className="btn-ghost px-2!" aria-label={t("filters.close")}>
            <Icon name="cross-circle" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
