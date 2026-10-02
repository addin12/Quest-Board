import { readUpload, uploadKind } from "@/lib/uploads";

/** GET /uploads/{name}.webp — an uploaded cover or portrait. Names are random and files never change. */
export async function GET(_req: Request, ctx: RouteContext<"/uploads/[file]">) {
  const { file } = await ctx.params;
  // A QRIS code is payment information: only /payment-qr serves it, to the people who may see it.
  const data = uploadKind(file) === "qris" ? null : readUpload(file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
