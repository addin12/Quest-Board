import { getCurrentUser } from "@/lib/auth";
import { gmEarningRows } from "@/lib/queries";
import { earningsCsv } from "@/lib/earnings";

/** GET /api/gm/earnings — my booked seats as CSV (GMs only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "gm" && user.role !== "admin")) return new Response("Unauthorized", { status: 401 });
  return new Response(earningsCsv(gmEarningRows(user.id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quest-board-earnings-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
