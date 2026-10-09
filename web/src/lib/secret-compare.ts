import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets in constant time (CLAUDE.md, Security). Both sides are hashed first, so different
 * lengths take the same time too. Pure, so node --test can load it.
 * @example sameSecret(row.calendar_token, fromUrl) // true only for an exact match
 */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
