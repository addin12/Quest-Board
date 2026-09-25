import { getSessionWithGame } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { buildIcs, sessionEvent } from "@/lib/calendar";
import { siteOrigin } from "@/lib/site";
import { slugify } from "@/lib/policy";

/** GET /api/sessions/{id}/ics — one scheduled session as an iCalendar file (public details only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]/ics">) {
  const { id } = await ctx.params;
  const s = getSessionWithGame(Number(id));
  if (!s || s.status !== "scheduled" || s.game_status !== "published") {
    return new Response("Not found", { status: 404 });
  }
  const { t } = await getI18n();
  const ics = buildIcs(sessionEvent(s, await siteOrigin(), t));
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(s.title) || "session"}-${s.id}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
