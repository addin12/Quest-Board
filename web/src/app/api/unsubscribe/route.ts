import { db } from "@/lib/db";
import { makeT, type Lang } from "@/lib/i18n/dict";
import { applyUnsubscribe, checkUnsubscribe } from "@/lib/unsubscribe";

// The List-Unsubscribe link in notification and reminder emails (lib/unsubscribe.ts).
//   POST  one-click (RFC 8058: Gmail's and Yahoo's "Unsubscribe" button, or the form below): turns them off
//   GET   someone opened the link: a small page, in their language, with a button that POSTs
// No sign-in needed: the signed token is the proof. Anything wrong → 400.
export const dynamic = "force-dynamic";

const page = (lang: Lang, title: string, body: string) => new Response(
  `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#2b1d10;background:#faf3e3"><h1 style="font-size:1.4rem">${title}</h1>${body}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function who(request: Request) {
  const p = new URL(request.url).searchParams;
  const ok = checkUnsubscribe(p.get("u"), p.get("k"), p.get("t"));
  if (!ok) return null;
  const u = db().prepare("SELECT locale FROM users WHERE id = ? AND deleted_at IS NULL").get(ok.userId) as { locale: Lang } | undefined;
  return u ? { ...ok, lang: u.locale } : null;
}

export async function GET(request: Request) {
  const w = who(request);
  if (!w) return new Response("Invalid link", { status: 400 });
  const t = makeT(w.lang);
  const what = t(w.kind === "reminders" ? "unsub.reminders" : "unsub.notifications");
  return page(w.lang, t("unsub.title"), `<p>${esc(t("unsub.question", { what }))}</p><form method="post"><button style="font:inherit;padding:.5rem 1rem;border-radius:6px;border:0;background:#8e2b1c;color:#fbf3e2;cursor:pointer">${esc(t("unsub.button"))}</button></form>`);
}

export async function POST(request: Request) {
  const w = who(request);
  if (!w) return new Response("Invalid link", { status: 400 });
  applyUnsubscribe(w.userId, w.kind);
  const t = makeT(w.lang);
  const what = t(w.kind === "reminders" ? "unsub.reminders" : "unsub.notifications");
  return page(w.lang, t("unsub.doneTitle"), `<p>${esc(t("unsub.done", { what }))}</p>`);
}
