import { getCurrentUser } from "@/lib/auth";
import { exportAccount } from "@/lib/account";

/** GET /api/me/export — the signed-in person's data as a JSON download (UU PDP right of access). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return new Response(JSON.stringify(exportAccount(user.id), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="quest-board-data-${user.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
