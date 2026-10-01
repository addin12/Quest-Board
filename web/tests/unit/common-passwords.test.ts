// New passwords that are too easy to guess are refused (sign-up, reset, change).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommonPassword } from "../../src/lib/common-passwords.ts";

test("the most common passwords and their usual tricks are refused", () => {
  for (const p of [
    "password", "password123", "Password1!", "P@ssw0rd", "passw0rd2024", "qwerty123", "QWERTYUIOP", "12345678", "123456789",
    "87654321", "abcdefgh", "asdfghjkl", "1q2w3e4r", "11111111", "aaaaaaaa", "12121212", "abcabcabc", "iloveyou",
    "bismillah", "Bismillah123", "sayang2024!", "indonesia45", "merahputih", "jakarta123", "persib1933", "doraemon", "questboard",
    "dungeons&dragons",
  ]) assert.equal(isCommonPassword(p), true, p);
});

test("a password built from the person's own name or email is refused", () => {
  const me = ["Budi Santoso", "budi.santoso@gmail.com"];
  for (const p of ["budisantoso", "santoso1990", "Budi.Santoso", "budi.santoso", "santoso!!"]) assert.equal(isCommonPassword(p, me), true, p);
  assert.equal(isCommonPassword("santoso-and-the-red-dragon", me), false); // a longer passphrase that mentions it is fine
});

test("ordinary good passwords are accepted", () => {
  for (const p of ["tavern-demo-42", "a-good-password-123", "kopi susu di pagi hari", "Lentera7Naga", "brass lantern 27", "MejaBundarRabu!"]) {
    assert.equal(isCommonPassword(p, ["Andi Pratama", "andi@example.com"]), false, p);
  }
});
