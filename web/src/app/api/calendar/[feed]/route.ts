import { calendarFeedOwner, calendarFeedSessions } from "@/lib/queries";
import { buildIcsFeed, linkChangedEvent, sessionEvent } from "@/lib/calendar";
import { makeT } from "@/lib/i18n/dict";
import { siteOrigin } from "@/lib/site";

// GET /api/calendar/<id>.<secret>.ics — a person's private, subscribable calendar (public details only).
// The secret is the only credential, compared in constant time; it's revocable in Settings ("Reset link").
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[feed]">) {
  const { feed } = await ctx.params;
  const token = feed.replace(/\.ics$/, "");
  const owner = calendarFeedOwner(token);
  if (!owner && /^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    // A link in the old form (no "<id>."): one event saying where to get the new link. It reveals
    // nothing — the old secret isn't even looked up — so any such link gets the same answer.
    const ics = buildIcsFeed([linkChangedEvent(await siteOrigin(), makeT("en"), makeT("id"))], "Quest Board");
    return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
  }
  if (!owner) return new Response("Not found", { status: 404 });
  const t = makeT(owner.locale);
  const origin = await siteOrigin();
  const events = calendarFeedSessions(owner.id).map((s) => ({ ...sessionEvent(s, origin, t), cancelled: s.status === "cancelled" }));
  return new Response(buildIcsFeed(events, t("cal.feedName")), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
      "X-Robots-Tag": "noindex",
    },
  });
}
