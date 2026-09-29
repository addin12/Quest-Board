import "server-only";
import { db } from "./db";

// Records kept for security, deleted once they've done their job (Privacy Policy, "How long we
// keep data"): devices not used for a year, payment-detail changes older than a year (players are
// warned for 14 days, admins look at 30), and login steps that were never finished. Run by the cron.

const YEAR_MS = 365 * 86_400_000;

export function pruneSecurityRecords(now = Date.now()): { devices: number; paymentChanges: number; loginSteps: number } {
  const yearAgo = new Date(now - YEAR_MS).toISOString();
  return {
    devices: Number(db().prepare("DELETE FROM login_devices WHERE last_seen_at < ?").run(yearAgo).changes),
    paymentChanges: Number(db().prepare("DELETE FROM payment_changes WHERE changed_at < ?").run(yearAgo).changes),
    loginSteps: Number(db().prepare("DELETE FROM login_challenges WHERE expires_at < ?").run(new Date(now).toISOString()).changes),
  };
}
