// Manage admin accounts from the command line (production has no demo admin).
//
//   npm run admin -- list
//   npm run admin -- create <email> "<Name>"   new admin with a one-time password (printed once)
//   npm run admin -- promote <email>           make an existing account an admin
//   npm run admin -- demote <email>            back to GM (if they have a GM profile) or player
//   npm run admin -- reset-2fa <email>         turn off two-step login (lost phone); they can set it up again
//
// Uses QUESTBOARD_DB (default data/questboard.db). The app must have started once so the
// database exists at the current schema version; this tool never creates or migrates it.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hashPassword } from "../src/lib/password.ts";
import { SCHEMA_VERSION } from "../src/lib/schema.ts";
import { LEGAL_VERSION } from "../src/lib/legal.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const active = "deleted_at IS NULL AND suspended_at IS NULL";

export function listAdmins(db) {
  return db.prepare(`SELECT id, email, name, created_at FROM users WHERE role = 'admin' AND ${active} ORDER BY id`).all();
}

/** Returns { password } — shown once; the admin should change it in Settings. */
export function createAdmin(db, email, name) {
  email = String(email ?? "").trim().toLowerCase();
  name = String(name ?? "").trim();
  if (!EMAIL.test(email)) throw new Error(`Not a valid email: "${email}"`);
  if (name.length < 2 || name.length > 50) throw new Error("Name must be 2–50 characters.");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new Error(`${email} already has an account — use "promote" instead.`);
  }
  const password = randomBytes(12).toString("base64url");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (email, password_hash, name, role, email_verified_at, legal_seen_version) VALUES (?, ?, ?, 'admin', ?, ?)")
    .run(email, hashPassword(password), name, now, LEGAL_VERSION);
  return { password };
}

export function promote(db, email) {
  const u = db.prepare("SELECT id, role, deleted_at, suspended_at FROM users WHERE email = ?").get(String(email ?? "").trim());
  if (!u || u.deleted_at) throw new Error(`No account for ${email}.`);
  if (u.suspended_at) throw new Error(`${email} is suspended — unsuspend it in the admin console first.`);
  if (u.role === "admin") return false;
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
  return true;
}

export function demote(db, email) {
  const u = db.prepare("SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL").get(String(email ?? "").trim());
  if (!u) throw new Error(`No account for ${email}.`);
  if (u.role !== "admin") return false;
  if (listAdmins(db).length <= 1) throw new Error("That is the last admin — create or promote another one first.");
  const isGm = db.prepare("SELECT 1 FROM gm_profiles WHERE user_id = ? AND headline <> ''").get(u.id);
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(isGm ? "gm" : "player", u.id);
  return true;
}

/** Lost phone: turn two-step login off and end their sessions, so the next login is password-only. */
export function resetTwoStep(db, email) {
  const u = db.prepare("SELECT id, totp_enabled_at FROM users WHERE email = ? AND deleted_at IS NULL").get(String(email ?? "").trim().toLowerCase());
  if (!u) throw new Error(`No account for ${email}.`);
  if (!u.totp_enabled_at) return false;
  db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = -1 WHERE id = ?").run(u.id);
  db.prepare("DELETE FROM login_challenges WHERE user_id = ?").run(u.id);
  db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(u.id);
  return true;
}

function main(argv) {
  const [cmd, a, b] = argv;
  const file = process.env.QUESTBOARD_DB ?? "data/questboard.db";
  if (!["list", "create", "promote", "demote", "reset-2fa"].includes(cmd)) {
    console.log('Usage: npm run admin -- list | create <email> "<Name>" | promote <email> | demote <email> | reset-2fa <email>');
    return 1;
  }
  if (!existsSync(file)) {
    console.error(`No database at ${file}. Start the app once (it creates the database), or set QUESTBOARD_DB.`);
    return 1;
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000"); // wait for the running app instead of failing
  try {
    const { user_version } = db.prepare("PRAGMA user_version").get();
    if (user_version !== SCHEMA_VERSION) {
      console.error(`Database is at schema v${user_version}, this app expects v${SCHEMA_VERSION}. Start the app once to migrate it.`);
      return 1;
    }
    if (cmd === "list") {
      const admins = listAdmins(db);
      if (admins.length === 0) console.log("No admins yet. Create one with: npm run admin -- create <email> \"<Name>\"");
      for (const u of admins) console.log(`#${u.id}  ${u.email}  ${u.name}`);
    } else if (cmd === "create") {
      const { password } = createAdmin(db, a, b);
      console.log(`Admin ${a} created. One-time password (shown once, change it in Settings after logging in):\n\n  ${password}\n`);
    } else if (cmd === "promote") {
      console.log(promote(db, a) ? `${a} is now an admin.` : `${a} was already an admin.`);
    } else if (cmd === "reset-2fa") {
      console.log(resetTwoStep(db, a) ? `Two-step login is off for ${a}, and they were logged out everywhere. Ask them to set it up again in Settings.` : `${a} didn't have two-step login on.`);
    } else {
      console.log(demote(db, a) ? `${a} is no longer an admin.` : `${a} was not an admin.`);
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
