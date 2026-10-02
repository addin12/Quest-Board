// Pure: a browser's report that the Content Security Policy blocked something (lib/csp.ts sends them to
// /api/csp-report). Turned into one error-log line — or nothing, for the noise every site gets:
// browser extensions injecting scripts, and reports about pages that aren't ours.

export type CspViolation = { directive: string; blocked: string; path: string };

const EXTENSION = /^(chrome|moz|safari|safari-web|ms-browser)-extension:/i;

/** Both shapes: the classic {"csp-report": {...}} and the Reporting API's [{type: "csp-violation", body}]. */
export function parseCspReport(payload: unknown, ownOrigin: string): CspViolation[] {
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const r of payload) {
      const x = r as { type?: string; body?: Record<string, unknown> };
      if (x?.type === "csp-violation" && x.body) items.push(x.body);
    }
  } else if (payload && typeof payload === "object" && "csp-report" in payload) {
    items.push((payload as { "csp-report": Record<string, unknown> })["csp-report"] ?? {});
  }
  const out: CspViolation[] = [];
  for (const r of items) {
    const doc = String(r["document-uri"] ?? r.documentURL ?? "");
    const blocked = String(r["blocked-uri"] ?? r.blockedURL ?? "");
    const source = String(r["source-file"] ?? r.sourceFile ?? "");
    const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "").split(" ")[0];
    let url: URL;
    try {
      url = new URL(doc);
    } catch {
      continue;
    }
    if (url.origin !== ownOrigin) continue; // a report about someone else's page
    if (EXTENSION.test(blocked) || EXTENSION.test(source)) continue; // an extension, not us
    // Paths only (no query strings: they can hold tokens); other sites' URLs down to their origin.
    let shown = blocked;
    try {
      const b = new URL(blocked);
      shown = b.origin === ownOrigin ? b.pathname : b.origin;
    } catch {
      shown = blocked.slice(0, 40); // "inline", "eval", "data"…
    }
    out.push({ directive: directive.slice(0, 40) || "unknown", blocked: shown.slice(0, 120), path: url.pathname.slice(0, 200) });
  }
  return out.slice(0, 5);
}
