import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

// Format: scrypt$<saltHex>$<hashHex>
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash of a session token is stored, so a DB leak can't hijack sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
