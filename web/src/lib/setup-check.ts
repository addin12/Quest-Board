// Pure: is this deployment set up safely? Used by the admin console's Setup tab and logged at startup
// (src/instrumentation.ts). Each check says ok / warn / danger and why, in words an owner can act on.
import type { MsgKey } from "./i18n/dict";
import { configuredProviders, redirectedProvider } from "./mail-providers";

export type CheckLevel = "ok" | "warn" | "danger";
export type SetupCheck = { id: string; level: CheckLevel; title: MsgKey; detail: MsgKey; vars?: Record<string, string | number> };

export type SetupFacts = {
  env: Record<string, string | undefined>;
  /** When the cron route last ran (app_state cron_last_run), or null. */
  cronLastRun: string | null;
  /** When the newest backup file was written, or null when there is none. */
  lastBackupAt: string | null;
  /** Emails each provider accepted in the last 24 hours (lib/mailer.ts sentLast24h). */
  emailSent24h?: Partial<Record<string, number>>;
  /** Free space where the database lives, in bytes (null when unknown). */
  diskFreeBytes?: number | null;
  /** The last off-site upload (scripts/offsite.mjs → app_state offsite_last), or null. */
  offsiteLast?: { at: string; ok: boolean; detail: string; bytes?: number; keepDays?: number } | null;
  legalVersion: string;
  now: number;
};

/** Switches that exist only for development and the e2e servers. */
export const TEST_ONLY_SWITCHES = ["QUESTBOARD_DEV_OUTBOX", "QUESTBOARD_ALLOW_RESET", "QUESTBOARD_INSECURE_COOKIES", "QUESTBOARD_ADMIN_TWO_STEP", "QUESTBOARD_RATE_LIMIT", "QUESTBOARD_RATE_LIMIT_OVERRIDES"] as const;

const HOUR = 3_600_000;
const ago = (iso: string | null, now: number) => (iso ? Math.round((now - Date.parse(iso)) / HOUR) : null);

export function setupChecks(f: SetupFacts): SetupCheck[] {
  const e = f.env;
  const production = e.NODE_ENV === "production";
  const checks: SetupCheck[] = [];
  const on = TEST_ONLY_SWITCHES.filter((k) => e[k] !== undefined && e[k] !== "");
  checks.push(on.length
    ? { id: "test-switches", level: production ? "danger" : "warn", title: "setup.testSwitches", detail: "setup.testSwitchesOn", vars: { names: on.join(", ") } }
    : { id: "test-switches", level: "ok", title: "setup.testSwitches", detail: "setup.testSwitchesOff" });
  checks.push(e.QUESTBOARD_SEED === "false"
    ? { id: "seed", level: "ok", title: "setup.seed", detail: "setup.seedOff" }
    : { id: "seed", level: production ? "danger" : "warn", title: "setup.seed", detail: "setup.seedOn" });
  const providers = configuredProviders(e);
  const redirected = redirectedProvider(providers);
  checks.push(providers.length === 0
    ? { id: "email", level: production ? "danger" : "warn", title: "setup.email", detail: "setup.emailOff" }
    : redirected
      ? { id: "email", level: "warn", title: "setup.email", detail: "setup.emailElsewhere", vars: { url: redirected.url, provider: redirected.name } } // the rehearsal's stand-in
      : { id: "email", level: "ok", title: "setup.email", detail: "setup.emailOn", vars: { from: e.QUESTBOARD_MAIL_FROM ?? "", providers: providers.map((p) => p.name).join(" + ") } });
  if (providers.length > 0) {
    checks.push(providers.length > 1
      ? { id: "email-backup", level: "ok", title: "setup.emailBackup", detail: "setup.emailBackupOn", vars: { first: providers[0].name, second: providers[1].name } }
      : { id: "email-backup", level: "warn", title: "setup.emailBackup", detail: "setup.emailBackupOff", vars: { provider: providers[0].name } });
    if (providers.every((p) => p.limit > 0)) {
      const used = providers.reduce((n, p) => n + (f.emailSent24h?.[p.id] ?? 0), 0);
      const limit = providers.reduce((n, p) => n + p.limit, 0);
      checks.push(used >= 0.8 * limit
        ? { id: "email-today", level: "warn", title: "setup.emailToday", detail: "setup.emailTodayHigh", vars: { used, limit } }
        : { id: "email-today", level: "ok", title: "setup.emailToday", detail: "setup.emailTodayOk", vars: { used, limit } });
    }
  }
  const base = e.QUESTBOARD_BASE_URL ?? "";
  checks.push(base.startsWith("https://")
    ? { id: "base-url", level: "ok", title: "setup.baseUrl", detail: "setup.baseUrlOn", vars: { url: base } }
    : { id: "base-url", level: production ? "danger" : "warn", title: "setup.baseUrl", detail: base ? "setup.baseUrlNotHttps" : "setup.baseUrlOff", vars: { url: base } });
  checks.push(e.QUESTBOARD_ENFORCE_HTTPS === "true"
    ? { id: "https", level: "ok", title: "setup.https", detail: "setup.httpsOn" }
    : { id: "https", level: production ? "warn" : "ok", title: "setup.https", detail: "setup.httpsOff" });
  checks.push(e.QUESTBOARD_CONTACT_EMAIL
    ? { id: "contact", level: "ok", title: "setup.contact", detail: "setup.contactOn", vars: { email: e.QUESTBOARD_CONTACT_EMAIL } }
    : { id: "contact", level: "warn", title: "setup.contact", detail: "setup.contactOff" });
  const cronHours = ago(f.cronLastRun, f.now);
  checks.push(!e.QUESTBOARD_CRON_SECRET
    ? { id: "cron", level: production ? "danger" : "warn", title: "setup.cron", detail: "setup.cronNoSecret" }
    : cronHours === null || f.now - Date.parse(f.cronLastRun!) > 30 * 60_000
      ? { id: "cron", level: "danger", title: "setup.cron", detail: cronHours === null ? "setup.cronNever" : "setup.cronStale", vars: { hours: cronHours ?? 0 } }
      : { id: "cron", level: "ok", title: "setup.cron", detail: "setup.cronOk" });
  const backupHours = ago(f.lastBackupAt, f.now);
  checks.push(backupHours === null
    ? { id: "backup", level: production ? "danger" : "warn", title: "setup.backup", detail: "setup.backupNone" }
    : backupHours > 36
      ? { id: "backup", level: "danger", title: "setup.backup", detail: "setup.backupStale", vars: { hours: backupHours } }
      : { id: "backup", level: "ok", title: "setup.backup", detail: "setup.backupOk", vars: { hours: backupHours } });
  const GB = 1024 ** 3;
  const free = f.diskFreeBytes;
  if (free != null) {
    const gb = Math.round((free / GB) * 10) / 10;
    checks.push(free < 1 * GB
      ? { id: "disk", level: "danger", title: "setup.disk", detail: "setup.diskLow", vars: { gb } }
      : free < 3 * GB
        ? { id: "disk", level: "warn", title: "setup.disk", detail: "setup.diskGettingLow", vars: { gb } }
        : { id: "disk", level: "ok", title: "setup.disk", detail: "setup.diskOk", vars: { gb } });
  }
  const offsiteOn = !!(e.QUESTBOARD_OFFSITE_ENDPOINT && e.QUESTBOARD_OFFSITE_BUCKET && e.QUESTBOARD_OFFSITE_KEY_ID && e.QUESTBOARD_OFFSITE_SECRET);
  const last = f.offsiteLast ?? null;
  const lastHours = last ? ago(last.at, f.now) : null;
  checks.push(!offsiteOn
    ? { id: "offsite", level: "warn", title: "setup.offsite", detail: "setup.offsiteOff" }
    : !last
      ? { id: "offsite", level: "warn", title: "setup.offsite", detail: "setup.offsiteNotYet" }
      : !last.ok
        ? { id: "offsite", level: "danger", title: "setup.offsite", detail: "setup.offsiteFailed", vars: { error: last.detail } }
        : (lastHours ?? 0) > 36
          ? { id: "offsite", level: "danger", title: "setup.offsite", detail: "setup.offsiteStale", vars: { hours: lastHours ?? 0 } }
          : { id: "offsite", level: "ok", title: "setup.offsite", detail: "setup.offsiteOk", vars: { hours: lastHours ?? 0, what: last.detail } });
  if (offsiteOn && last?.ok && typeof last.bytes === "number") {
    // The free plans (Cloudflare R2, Backblaze B2) include 10 GB.
    const size = last.bytes >= GB ? `${Math.round((last.bytes / GB) * 10) / 10} GB` : `${Math.max(1, Math.round(last.bytes / 1024 ** 2))} MB`;
    const days = last.keepDays ?? 60;
    checks.push(last.bytes > 8 * GB
      ? { id: "offsite-space", level: "warn", title: "setup.offsiteSpace", detail: "setup.offsiteSpaceHigh", vars: { size, days } }
      : { id: "offsite-space", level: "ok", title: "setup.offsiteSpace", detail: days ? "setup.offsiteSpaceOk" : "setup.offsiteSpaceKeepAll", vars: { size, days } });
  }
  checks.push(f.legalVersion.endsWith("-draft")
    ? { id: "legal", level: production ? "warn" : "ok", title: "setup.legal", detail: "setup.legalDraft", vars: { version: f.legalVersion } }
    : { id: "legal", level: "ok", title: "setup.legal", detail: "setup.legalFinal", vars: { version: f.legalVersion } });
  return checks;
}
