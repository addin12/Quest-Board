import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationEmail } from "../../src/lib/session-mail.ts";

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
