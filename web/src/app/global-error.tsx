"use client"; // Error boundaries must be Client Components

import { DEFAULT_LANG, translator } from "@/lib/i18n/core";
import { en } from "@/lib/i18n/en";

// Replaces the root layout when the layout itself fails, so there is no
// I18nProvider or global CSS here: keep it self-contained, in the default language.
const t = translator(en); // DEFAULT_LANG: only English is bundled here

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang={DEFAULT_LANG}>
      <body style={{ fontFamily: "Georgia, serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#efe3c8", color: "#2b1d10" }}>
        <title>{`${t("error.title")} · Quest Board`}</title>
        <main style={{ maxWidth: 420, padding: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>{t("error.title")}</h1>
          <p style={{ color: "#665034", margin: "0 0 24px" }}>{t("error.body")}</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: "#8e2b1c", color: "#fbf3e2", border: 0, borderRadius: 6, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
          >
            {t("error.retry")}
          </button>
        </main>
      </body>
    </html>
  );
}
