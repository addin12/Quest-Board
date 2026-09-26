"use client";

import { useState } from "react";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

/** The private feed URL with copy + "add to" buttons (Google needs the webcal:// form). */
export function CalendarFeedLinks({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/, "webcal:");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("cal.feedCopy"), url);
    }
  }
  return (
    <div className="space-y-3">
      <label htmlFor="feed-url" className="label">{t("cal.feedUrl")}</label>
      <div className="flex flex-wrap gap-2">
        <input id="feed-url" readOnly value={url} className="input min-w-0 flex-1 font-mono text-xs!" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy} className="btn-secondary"><Icon name={copied ? "check" : "link-alt"} /> {copied ? t("share.copied") : t("cal.feedCopy")}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary"><Icon name="calendar-plus" /> {t("cal.feedGoogle")}</a>
        <a href={webcal} className="btn-secondary"><Icon name="calendar" /> {t("cal.feedApple")}</a>
      </div>
    </div>
  );
}
