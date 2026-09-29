// Two-step login codes (RFC 6238), checked against the RFC's own test vectors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { base32Decode, base32Encode, newTotpSecret, otpauthUri, totpCode, totpStep, verifyTotp } from "../../src/lib/totp.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";
import { createAdmin, resetTwoStep } from "../../scripts/admin.mjs";

const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890")); // the RFC's SHA-1 key

test("codes match RFC 6238 (SHA-1, 8 digits) and base32 round-trips", () => {
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  for (const [seconds, code] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]] as const) {
    assert.equal(totpCode(RFC_SECRET, totpStep(seconds * 1000), 8), code, `T=${seconds}`);
  }
  assert.equal(totpCode(RFC_SECRET, totpStep(59_000)), "287082"); // the app uses the last 6 digits
  const s = newTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(base32Encode(base32Decode(s.toLowerCase().replace(/(.{4})/g, "$1 "))), s); // typed with spaces, any case
});

test("a code is accepted for one step either side, and only once", () => {
  const now = 1_800_000_000_000;
  const step = totpStep(now);
  const s = newTotpSecret();
  assert.equal(verifyTotp(s, totpCode(s, step), now), step);
  assert.equal(verifyTotp(s, totpCode(s, step - 1), now), step - 1); // phone a little slow
  assert.equal(verifyTotp(s, totpCode(s, step + 1), now), step + 1); // or fast
  assert.equal(verifyTotp(s, totpCode(s, step - 2), now), null);     // too old
  assert.equal(verifyTotp(s, ` ${totpCode(s, step).slice(0, 3)} ${totpCode(s, step).slice(3)} `, now), step); // "123 456"
  assert.equal(verifyTotp(s, totpCode(s, step), now, step), null);   // already used
  assert.equal(verifyTotp(s, totpCode(s, step - 1), now, step), null); // older than the last used one
  assert.equal(verifyTotp(s, "12345", now), null);
  assert.equal(verifyTotp(s, "abcdef", now), null);
  assert.match(otpauthUri("Quest Board", "a@b.test", s), /^otpauth:\/\/totp\/Quest%20Board%3Aa%40b\.test\?secret=[A-Z2-7]{32}&issuer=Quest%20Board&/);
});

test("admin CLI: reset-2fa turns two-step login off and ends every session", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  createAdmin(db, "a@x.test", "Admin A");
  assert.equal(resetTwoStep(db, "a@x.test"), false); // wasn't on
  db.exec("UPDATE users SET totp_secret = 'ABC', totp_enabled_at = '2026-01-01', totp_last_step = 5");
  db.exec("INSERT INTO auth_sessions (token_hash, user_id, expires_at) SELECT 'h', id, '2999-01-01' FROM users");
  db.exec("INSERT INTO login_challenges (token_hash, user_id, expires_at) SELECT 'c', id, '2999-01-01' FROM users");
  assert.equal(resetTwoStep(db, " A@x.test "), true);
  assert.deepEqual({ ...db.prepare("SELECT totp_secret, totp_enabled_at, totp_last_step FROM users").get() }, { totp_secret: null, totp_enabled_at: null, totp_last_step: -1 });
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM login_challenges").get() as { n: number }).n, 0);
  assert.throws(() => resetTwoStep(db, "nobody@x.test"), /No account/);
});
