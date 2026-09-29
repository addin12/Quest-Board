import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Time-based one-time codes (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) — what Google
// Authenticator, Authy, 1Password, Microsoft Authenticator etc. produce. Pure functions, so the
// e2e tests can compute codes too.

const STEP_MS = 30_000;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 (the form authenticator apps take). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export const totpStep = (ms: number) => Math.floor(ms / STEP_MS);

/** The code for one 30-second step. `digits` is 6 in the app; RFC test vectors use 8. */
export function totpCode(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

/**
 * The step a code belongs to, or null. Accepts the previous and next step too (phone clocks
 * drift), but never a step at or before `lastUsedStep` — each code works once.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), lastUsedStep = -1): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const current = totpStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(given))) return step;
  }
  return null;
}

/** The otpauth:// link an authenticator app reads from the QR code. */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
