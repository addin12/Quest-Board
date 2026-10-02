import { brevoEvent, brevoTokenOk, resendEvent, svixSignatureOk } from "@/lib/email-events";
import { recordEmailEvent } from "@/lib/email-suppression";
import { readTextLimited } from "@/lib/read-body";
import { clientIp, hit } from "@/lib/rate-limit";

// Delivery events from the email providers (deploy/EMAIL-DNS.md, "Bounces and spam complaints"):
//   POST /api/email-events/resend               signed by Resend (Svix), secret RESEND_WEBHOOK_SECRET
//   POST /api/email-events/brevo?token=…        the token is QUESTBOARD_BREVO_WEBHOOK_TOKEN
// Bounces for good and spam complaints stop optional emails to that address (lib/email-suppression.ts).
// Anything else is acknowledged and ignored, so the provider doesn't keep retrying it.
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const body = await readTextLimited(request, 256 * 1024); // never buffers more than that
  if (body === null) return new Response("Too large", { status: 413 });
  // Someone guessing at the secret: each failed attempt counts, and too many from one address are refused.
  const refuse = async (why: string) => (hit("webhookAuth", await clientIp()) ? new Response(why, { status: 401 }) : new Response("Too many attempts", { status: 429 }));
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  if (provider === "resend") {
    const h = request.headers;
    if (!svixSignatureOk(process.env.RESEND_WEBHOOK_SECRET ?? "", { id: h.get("svix-id"), timestamp: h.get("svix-timestamp"), signature: h.get("svix-signature") }, body)) {
      return refuse("Bad signature");
    }
    const event = resendEvent(payload);
    return Response.json({ ok: true, recorded: event ? recordEmailEvent(event, "resend") : 0 });
  }
  if (provider === "brevo") {
    if (!brevoTokenOk(process.env.QUESTBOARD_BREVO_WEBHOOK_TOKEN, new URL(request.url).searchParams.get("token"))) return refuse("Bad token");
    // Brevo may send one event or a list of them.
    const events = (Array.isArray(payload) ? payload : [payload]).map(brevoEvent).filter((e) => e !== null);
    return Response.json({ ok: true, recorded: events.reduce((n, e) => n + recordEmailEvent(e, "brevo"), 0) });
  }
  return new Response("Unknown provider", { status: 404 });
}
