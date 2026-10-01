import { brevoEvent, brevoTokenOk, resendEvent, svixSignatureOk } from "@/lib/email-events";
import { recordEmailEvent } from "@/lib/email-suppression";

// Delivery events from the email providers (deploy/EMAIL-DNS.md, "Bounces and spam complaints"):
//   POST /api/email-events/resend               signed by Resend (Svix), secret RESEND_WEBHOOK_SECRET
//   POST /api/email-events/brevo?token=…        the token is QUESTBOARD_BREVO_WEBHOOK_TOKEN
// Bounces for good and spam complaints stop optional emails to that address (lib/email-suppression.ts).
// Anything else is acknowledged and ignored, so the provider doesn't keep retrying it.
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const body = await request.text();
  if (body.length > 256 * 1024) return new Response("Too large", { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  if (provider === "resend") {
    const h = request.headers;
    if (!svixSignatureOk(process.env.RESEND_WEBHOOK_SECRET ?? "", { id: h.get("svix-id"), timestamp: h.get("svix-timestamp"), signature: h.get("svix-signature") }, body)) {
      return new Response("Bad signature", { status: 401 });
    }
    const event = resendEvent(payload);
    return Response.json({ ok: true, recorded: event ? recordEmailEvent(event, "resend") : 0 });
  }
  if (provider === "brevo") {
    if (!brevoTokenOk(process.env.QUESTBOARD_BREVO_WEBHOOK_TOKEN, new URL(request.url).searchParams.get("token"))) return new Response("Bad token", { status: 401 });
    // Brevo may send one event or a list of them.
    const events = (Array.isArray(payload) ? payload : [payload]).map(brevoEvent).filter((e) => e !== null);
    return Response.json({ ok: true, recorded: events.reduce((n, e) => n + recordEmailEvent(e, "brevo"), 0) });
  }
  return new Response("Unknown provider", { status: 404 });
}
