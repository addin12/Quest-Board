// Pure: wording that often means a scam or spam, in Indonesian and English. A match never blocks
// or hides a post: it files an automatic report for a moderator to look at (lib/moderation.ts
// autoFlag). Tuned to stay quiet on ordinary table talk — a WhatsApp group link or a phone number
// alone is normal; together with money it's worth a look.

export const SCAM_SIGNALS = ["credentials", "gambling", "newAccount", "fee", "shortLink", "offPlatformPay"] as const;
export type ScamSignal = (typeof SCAM_SIGNALS)[number];
export const isScamSignal = (v: string): v is ScamSignal => (SCAM_SIGNALS as readonly string[]).includes(v);

const RULES: [ScamSignal, RegExp[]][] = [
  // "Send me your OTP / PIN / password", "kode verifikasi".
  ["credentials", [
    /\b(kode\s*)?otp\b/,
    /\bkode\s+verifikasi\b/,
    /\b(kirim|kasih|kasi|share|bagi|minta|sebut|send|give|tell)\w*\s+(\S+\s+){0,3}(pin|password|kata\s*sandi|verification\s+code|kode\s+(akses|keamanan))\b/,
  ]],
  // Online gambling, loan and "guaranteed profit" spam.
  ["gambling", [
    /\b(slot\s*)?gacor\b/, /\bmaxwin\b/, /\b(judi|togel)\b/, /\bdeposit\s+(slot|judi)\b/,
    /\bpinjol\b/, /\bpinjaman\s+online\b/, /\bprofit\s+(harian|pasti)\b/, /\binvestasi\s+(pasti|untung|aman)\b/,
    /\b(guaranteed|daily)\s+profit\b/,
  ]],
  // "Pay to a new / different account" — the classic switch.
  ["newAccount", [
    /\b(rekening|norek|no\.?\s*rek)\s+(baru|lain|pengganti|yang\s+lain)\b/,
    /\b(ganti|pindah|ubah)\s+(nomor\s+)?(rekening|norek)\b/,
    /\b(jangan|tidak\s+usah|gak\s+usah|ga\s+usah|nggak\s+usah)\s+bayar\s+(lewat|pakai|ke)\b/,
    /\b(new|different|another|other)\s+(bank\s+)?account\b/,
    /\bdon'?t\s+pay\s+(via|through|using|to)\b/,
  ]],
  // Up-front "admin / verification / registration fee".
  ["fee", [/\bbiaya\s+(admin|verifikasi|aktivasi|pendaftaran|pencairan)\b/, /\b(admin|verification|activation|registration)\s+fee\b/]],
  // Link shorteners hide where a link goes.
  ["shortLink", [/\b(bit\.ly|s\.id|tinyurl\.com|cutt\.ly|shorturl\.at|rb\.gy|t\.co|is\.gd)\/\S/]],
];

const OFF_PLATFORM = /(wa\.me\/|chat\.whatsapp\.com|api\.whatsapp\.com|\bt\.me\/|(\+62|\b62|\b0)8\d{2}[\s.-]?\d{3,4}[\s.-]?\d{3,5}\b)/;
const MONEY = /\b(transfer|tf|rekening|norek|bayar|dp|uang|dana|gopay|ovo|shopeepay|rp\.?\s?\d|\d+\s?(rb|ribu|jt|juta)|pay|payment|money)\b/;

/** Which signals `text` shows (empty = nothing to flag). */
export function scamSignals(text: string): ScamSignal[] {
  const s = text.toLowerCase().replace(/\s+/g, " ");
  const found = RULES.filter(([, res]) => res.some((re) => re.test(s))).map(([sig]) => sig);
  if (OFF_PLATFORM.test(s) && MONEY.test(s)) found.push("offPlatformPay");
  return found;
}
