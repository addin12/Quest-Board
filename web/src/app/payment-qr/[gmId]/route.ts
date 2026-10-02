import { getCurrentUser } from "@/lib/auth";
import { paymentQrFor } from "@/lib/queries";
import { readUpload } from "@/lib/uploads";
import { parseUploadPath } from "@/lib/upload-rules";

// GET /payment-qr/<gm id> (or /payment-qr/me): a GM's QRIS code. Payment details are for the people who
// pay — someone with a confirmed seat at one of the GM's games, the requester who chose them (hire a
// GM), the GM, and admins — so this checks, unlike /uploads (which won't serve QRIS pictures at all).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/payment-qr/[gmId]">) {
  const user = await getCurrentUser();
  const { gmId } = await ctx.params;
  if (!user) return new Response("Not found", { status: 404 });
  const id = gmId === "me" ? user.id : Number(gmId);
  const path = Number.isInteger(id) && id > 0 ? paymentQrFor(user.id, id) : null;
  const name = path ? parseUploadPath(path) : null;
  const bytes = name ? readUpload(name) : null;
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
