// Pure: which email providers this server has, in the order they're tried, and each one's daily limit.
// Used by the mailer (lib/mailer.ts) and the setup check (lib/setup-check.ts).
//
// Resend's free plan sends 100 emails a day, Brevo's 300. Set RESEND_DAILY_LIMIT / BREVO_DAILY_LIMIT to
// your plan's limit (0 = no limit). When the first provider is full or down, the next one takes over.

export type ProviderId = "resend" | "brevo";
export type ProviderInfo = { id: ProviderId; name: string; limit: number; url: string };

/** Share of each provider's daily limit kept for important emails (sign-up, password, security). */
export const IMPORTANT_RESERVE = 0.2;

const DEFAULTS: Record<ProviderId, { name: string; limit: number; url: string }> = {
  resend: { name: "Resend", limit: 100, url: "https://api.resend.com" },
  brevo: { name: "Brevo", limit: 300, url: "https://api.brevo.com" },
};

function limitFrom(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** The providers that are set up (an API key plus QUESTBOARD_MAIL_FROM), Resend first. */
export function configuredProviders(env: Record<string, string | undefined>): ProviderInfo[] {
  if (!env.QUESTBOARD_MAIL_FROM) return [];
  const out: ProviderInfo[] = [];
  // QUESTBOARD_*_URL: only for the production rehearsal's stand-ins (Admin → Setup warns).
  if (env.RESEND_API_KEY) out.push({ id: "resend", name: DEFAULTS.resend.name, limit: limitFrom(env.RESEND_DAILY_LIMIT, DEFAULTS.resend.limit), url: (env.QUESTBOARD_RESEND_URL || DEFAULTS.resend.url).replace(/\/+$/, "") });
  if (env.BREVO_API_KEY) out.push({ id: "brevo", name: DEFAULTS.brevo.name, limit: limitFrom(env.BREVO_DAILY_LIMIT, DEFAULTS.brevo.limit), url: (env.QUESTBOARD_BREVO_URL || DEFAULTS.brevo.url).replace(/\/+$/, "") });
  return out;
}

/** A provider that isn't its real address (the rehearsal's stand-in), or undefined. */
export const redirectedProvider = (providers: ProviderInfo[]) => providers.find((p) => p.url !== DEFAULTS[p.id].url);

/** May this email use the provider, having sent `used` in the last 24 hours? Optional ones leave the reserve alone. */
export function hasRoom(p: Pick<ProviderInfo, "limit">, used: number, optional: boolean): boolean {
  if (p.limit === 0) return true;
  return used < (optional ? p.limit - Math.ceil(p.limit * IMPORTANT_RESERVE) : p.limit);
}

/** "Quest Board <halo@questboard.id>" → { name, email } (Brevo wants them apart). */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!m) return { email: from.trim() };
  const name = m[1].replace(/^"(.*)"$/, "$1").trim();
  return name ? { name, email: m[2].trim() } : { email: m[2].trim() };
}
