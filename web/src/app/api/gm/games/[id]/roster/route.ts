import { getCurrentUser } from "@/lib/auth";
import { gameRosterRows, getGameById } from "@/lib/queries";
import { rosterCsv } from "@/lib/earnings";

/** GET /api/gm/games/{id}/roster — every seat booked for one of my games, as CSV (the game's GM or an admin). */
export async function GET(_req: Request, ctx: RouteContext<"/api/gm/games/[id]/roster">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const game = getGameById(Number(id));
  if (!user || !game || (game.gm_id !== user.id && user.role !== "admin")) return new Response("Not found", { status: 404 });
  return new Response(rosterCsv(gameRosterRows(game.id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster-${game.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
