// The player's own cancellation confirmation (lib/session-mail.ts): what they cancelled, in their time zone,
// and for a paid seat that refunds are arranged with the GM, with the GM's terms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { playerCancelledEmail } from "../../src/lib/session-mail.ts";

const person = { email: "pia@x.test", name: "Pia", locale: "en" as const, time_zone: "Asia/Makassar" };
const session = { title: "Kopi & Naga", slug: "kopi-naga", starts_at: "2026-10-20T11:00:00.000Z", gm_name: "Vina", gm_refund_terms: "Full refund up to 24 hours before." };

test("a paid seat: the GM arranges the refund, with their terms; in the player's time zone", () => {
  const m = playerCancelledEmail(person, session, { price_idr: 50_000, paid: true }, "https://questboard.id");
  assert.equal(m.to, "pia@x.test");
  assert.match(m.subject, /^You cancelled your seat: Kopi & Naga — /);
  assert.match(m.subject, /19[.:]00 WITA/);
  assert.match(m.text, /marked your seat as paid \(Rp 50\.000\)\. Refunds are arranged directly with the GM, Vina/);
  assert.match(m.text, /refund terms:\nFull refund up to 24 hours before\./);
  assert.match(m.text, /https:\/\/questboard\.id\/games\/kopi-naga/);
});

test("not marked paid: 'if you've already paid'; a free seat says nothing about money", () => {
  assert.match(playerCancelledEmail(person, session, { price_idr: 50_000, paid: false }, "https://q.test").text, /If you've already paid \(Rp 50\.000\)/);
  const free = playerCancelledEmail(person, session, { price_idr: 0, paid: false }, "https://q.test").text;
  assert.doesNotMatch(free, /refund|paid|Rp/i);
});

test("in Indonesian", () => {
  const m = playerCancelledEmail({ ...person, locale: "id" }, { ...session, gm_refund_terms: null }, { price_idr: 50_000, paid: false }, "https://q.test");
  assert.match(m.subject, /^Kamu membatalkan kursimu: /);
  assert.match(m.text, /Kalau kamu sudah membayar \(Rp 50\.000\), atur refund-nya langsung dengan GM, Vina/);
  assert.doesNotMatch(m.text, /Ketentuan/);
});
