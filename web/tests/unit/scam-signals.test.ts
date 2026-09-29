// Automatic scam flags: catch the usual scripts, stay quiet on ordinary table talk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scamSignals } from "../../src/lib/scam-signals.ts";

test("scam and spam wording is flagged, with the reason", () => {
  const cases: [string, string[]][] = [
    ["Halo kak, boleh kirim kode OTP yang masuk ke HP kakak?", ["credentials"]],
    ["Tolong kasih tau PIN m-banking kamu ya buat verifikasi", ["credentials"]],
    ["Send me your verification code to confirm the seat", ["credentials"]],
    ["Main slot gacor maxwin hari ini!", ["gambling"]],
    ["Butuh dana cepat? Pinjol tanpa BI checking", ["gambling"]],
    ["Maaf kak, rekening lama diblokir. Transfer ke rekening baru ya: BRI 1234", ["newAccount"]],
    ["Jangan bayar lewat detail di profil, ganti rekening dulu", ["newAccount"]],
    ["Please pay to a different account this week", ["newAccount"]],
    ["Ada biaya admin Rp25.000 sebelum kursi dikonfirmasi", ["fee"]],
    ["Info lengkap di bit.ly/promo-meja", ["shortLink"]],
    ["DP 50rb dulu ya, chat aku di wa.me/6281234567890", ["offPlatformPay"]],
    ["Transfer lalu konfirmasi ke 0812-3456-7890", ["offPlatformPay"]],
  ];
  for (const [text, signals] of cases) assert.deepEqual(scamSignals(text), signals, text);
});

test("ordinary table talk is not flagged", () => {
  for (const text of [
    "Sampai jumpa Sabtu jam 19.00! Jangan lupa bawa dadu.",
    "Link grup WhatsApp buat sesi: chat.whatsapp.com/AbCdEf",
    "Discord kita: discord.gg/questboard, voice channel #meja-1",
    "Kalau telat kabari aku di 0812 3456 7890 ya",
    "Pembayaran sesuai detail di halaman game, makasih!",
    "My character's password to the vault is 'dragon'", // in-fiction, no ask
    "The rekening thing is in the game page",
    "Kita pakai sistem D&D 5e, level 3, investasi waktu sekitar 4 jam",
  ]) assert.deepEqual(scamSignals(text), [], text);
});
