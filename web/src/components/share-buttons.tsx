"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

const noopSubscribe = () => () => {};

/** WhatsApp, copy-link and (where supported) the phone's native share sheet. */
export function ShareButtons({ url, text }: { url: string; text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // navigator.share only exists in the browser (mostly phones); false during SSR.
  const canNativeShare = useSyncExternalStore(noopSubscribe, () => typeof navigator.share === "function", () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("share.copy"), url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("share.title")}>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary px-3! py-1.5! text-xs!"
      >
        <Icon name="whatsapp" brand className="text-[#1f7a4a]" /> {t("share.whatsapp")}
      </a>
      <button type="button" onClick={copy} className="btn-secondary px-3! py-1.5! text-xs!">
        <Icon name={copied ? "check" : "link-alt"} /> {copied ? t("share.copied") : t("share.copy")}
      </button>
      {canNativeShare && (
        <button type="button" onClick={() => navigator.share({ title: text, text, url }).catch(() => {})} className="btn-ghost px-3! py-1.5! text-xs!">
          <Icon name="share" /> {t("share.native")}
        </button>
      )}
      <span className="sr-only" aria-live="polite">{copied ? t("share.copied") : ""}</span>
    </div>
  );
}
