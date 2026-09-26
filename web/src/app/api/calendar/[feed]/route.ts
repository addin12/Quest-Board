import { calendarFeedOwner, calendarFeedSessions } from "@/lib/queries";
import { buildIcsFeed, sessionEvent } from "@/lib/calendar";
import { makeT } from "@/lib/i18n/dict";
import { siteOrigin } from "@/lib/site";

// GET /api/calendar/<token>.ics — a person's private, subscribable calendar (public details only).
// The token is the only credential: it's revocable in Settings ("Reset link").
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[feed]">) {
  const { feed } = await ctx.params;
  const owner = calendarFeedOwner(feed.replace(/\.ics$/, ""));
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
