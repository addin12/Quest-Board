// Pure: is this deployment set up safely? Used by the admin console's Setup tab and logged at startup
// (src/instrumentation.ts). Each check says ok / warn / danger and why, in words an owner can act on.
import type { MsgKey } from "./i18n/dict";

export type CheckLevel = "ok" | "warn" | "danger";
export type SetupCheck = { id: string; level: CheckLevel; title: MsgKey; detail: MsgKey; vars?: Record<string, string | number> };

export type SetupFacts = {
  env: Record<string, string | undefined>;
  /** When the cron route last ran (app_state cron_last_run), or null. */
  cronLastRun: string | null;
  /** When the newest backup file was written, or null when there is none. */
  lastBackupAt: string | null;
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
  const emailOk = !!e.RESEND_API_KEY && !!e.QUESTBOARD_MAIL_FROM;
  checks.push(emailOk
    ? { id: "email", level: "ok", title: "setup.email", detail: "setup.emailOn", vars: { from: e.QUESTBOARD_MAIL_FROM ?? "" } }
    : { id: "email", level: production ? "danger" : "warn", title: "setup.email", detail: "setup.emailOff" });
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
  checks.push(f.legalVersion.endsWith("-draft")
    ? { id: "legal", level: production ? "warn" : "ok", title: "setup.legal", detail: "setup.legalDraft", vars: { version: f.legalVersion } }
    : { id: "legal", level: "ok", title: "setup.legal", detail: "setup.legalFinal", vars: { version: f.legalVersion } });
  return checks;
}
