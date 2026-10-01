// Delivery events from the email providers: signatures and which events stop optional emails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { brevoEvent, brevoTokenOk, resendEvent, svixSignatureOk } from "../../src/lib/email-events.ts";

test("Resend's webhook signature (Svix) matches Svix's published example", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const h = { id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: "1614265330", signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" };
  const body = '{"test": 2432232314}';
  const at = 1614265330 * 1000;
  assert.equal(svixSignatureOk(secret, h, body, at), true);
  assert.equal(svixSignatureOk(secret, { ...h, signature: `v1,bm90IGl0 ${h.signature}` }, body, at), true); // one of several
  assert.equal(svixSignatureOk(secret, h, '{"test": 2432232315}', at), false); // changed body
  assert.equal(svixSignatureOk("whsec_" + Buffer.from("another key").toString("base64"), h, body, at), false);
  assert.equal(svixSignatureOk(secret, h, body, at + 6 * 60_000), false); // too old: a replay
  assert.equal(svixSignatureOk(secret, { ...h, signature: null }, body, at), false);
  assert.equal(svixSignatureOk("", h, body, at), false); // not set up: nothing is accepted
});

test("a freshly signed request is accepted", () => {
  const key = Buffer.from("rehearsal secret key");
  const secret = "whsec_" + key.toString("base64");
  const id = "msg_1", ts = String(Math.floor(Date.now() / 1000)), body = '{"type":"email.bounced"}';
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  assert.equal(svixSignatureOk(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body), true);
});

test("which events stop optional emails", () => {
  assert.deepEqual(resendEvent({ type: "email.bounced", data: { to: ["Dead@Example.com"], bounce: { message: "Mailbox does not exist", type: "Permanent" } } }),
    { emails: ["dead@example.com"], reason: "bounce", detail: "Mailbox does not exist" });
  assert.equal(resendEvent({ type: "email.complained", data: { to: ["a@x.test"] } })?.reason, "complaint");
  assert.equal(resendEvent({ type: "email.bounced", data: { to: ["a@x.test"], bounce: { type: "Transient" } } }), null); // retried by Resend
  assert.equal(resendEvent({ type: "email.delivered", data: { to: ["a@x.test"] } }), null);
  assert.equal(resendEvent({ type: "email.bounced", data: { to: ["not an address"] } }), null);
  assert.equal(resendEvent(null), null);

  for (const event of ["hard_bounce", "invalid_email", "blocked"]) assert.equal(brevoEvent({ event, email: "a@x.test" })?.reason, "bounce", event);
  assert.equal(brevoEvent({ event: "spam", email: "a@x.test" })?.reason, "complaint");
  assert.equal(brevoEvent({ event: "soft_bounce", email: "a@x.test" }), null);
  assert.equal(brevoEvent({ event: "delivered", email: "a@x.test" }), null);

  assert.equal(brevoTokenOk("secret-token", "secret-token"), true);
  assert.equal(brevoTokenOk("secret-token", "secret-tokeN"), false);
  assert.equal(brevoTokenOk(undefined, "anything"), false); // not set up: nothing is accepted
  assert.equal(brevoTokenOk("secret-token", null), false);
});
