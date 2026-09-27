import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationEmail, movedEmail } from "../../src/lib/session-mail.ts";

const s = { title: "Naga", slug: "naga", starts_at: "2026-10-03T12:00:00.000Z" };

test("cancellation email: in the player's language, with the GM's message when given", () => {
  const id = cancellationEmail({ email: "a@x.test", name: "Sari", locale: "id" }, s, "Aku sakit, pindah ke Sabtu depan.", "https://qb.test");
  assert.equal(id.subject, "Dibatalkan: Naga — Sab, 3 Okt, 19.00 WIB");
  assert.match(id.text, /^Hai Sari,/);
  assert.match(id.text, /Pesan dari GM: “Aku sakit, pindah ke Sabtu depan.”/);
  assert.match(id.text, /https:\/\/qb\.test\/games\/naga/);
  const en = cancellationEmail({ email: "b@x.test", name: "Ben", locale: "en" }, s, "", "https://qb.test");
  assert.equal(en.subject, "Cancelled: Naga — Sat 3 Oct, 19.00 WIB");
  assert.doesNotMatch(en.text, /Message from the GM/);
  assert.doesNotMatch(en.text, /\{reason\}/);
});

test("time-changed email: the old and new time in the player's language, and where to cancel", () => {
  const to = { starts_at: "2026-10-04T13:00:00.000Z", duration_minutes: 240 };
  const id = movedEmail({ email: "a@x.test", name: "Sari", locale: "id" }, s, s, to, "https://qb.test");
  assert.equal(id.subject, "Waktu baru: Naga — Min, 4 Okt, 20.00 WIB");
  assert.match(id.text, /Sebelumnya: Sab, 3 Okt, 19\.00 WIB/);
  assert.match(id.text, /Sekarang: Min, 4 Okt, 20\.00 WIB \(4 jam\)/);
  assert.match(id.text, /https:\/\/qb\.test\/dashboard/);
  const en = movedEmail({ email: "b@x.test", name: "Ben", locale: "en" }, s, s, to, "https://qb.test");
  assert.equal(en.subject, "New time: Naga — Sun 4 Oct, 20.00 WIB");
  assert.match(en.text, /Was: Sat 3 Oct, 19\.00 WIB\nNow: Sun 4 Oct, 20\.00 WIB \(4 hours\)/);
  assert.doesNotMatch(en.text, /\{\w+\}/);
});

test("cancellation email for an archived game links to other games, not the gone page", () => {
  const m = cancellationEmail({ email: "a@x.test", name: "Ben", locale: "en" }, { ...s, archived: true }, "", "https://qb.test");
  assert.match(m.text, /https:\/\/qb\.test\/games\n/);
  assert.doesNotMatch(m.text, /\/games\/naga/);
});
