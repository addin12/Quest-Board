import { test } from "node:test";
import assert from "node:assert/strict";
import { emailHtml } from "../../src/lib/email-html.ts";

const text = "Hi Sari & friends,\n\nThe GM changed the time:\n\nNaga <3\nNow: Sun 4 Oct, 20.00 WIB\n\nIf it doesn't work, cancel in My games:\nhttps://qb.test/dashboard\n\nSee https://qb.test/games/naga, or reply.\n\n— Quest Board";

test("HTML email: paragraphs, escaped text, the main link as a button, inline links", () => {
  const html = emailHtml("New time: Naga", text);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>New time: Naga<\/title>/);
  assert.match(html, /Hi Sari &amp; friends,/); // escaped
  assert.match(html, /Naga &lt;3<br>Now: Sun 4 Oct, 20\.00 WIB/); // line breaks kept, markup escaped
  assert.doesNotMatch(html, /<3/);
  // A link alone on the last line of a paragraph becomes a button (plus the address in small print).
  assert.match(html, /<a href="https:\/\/qb\.test\/dashboard" style="display:inline-block;[^"]*">qb\.test\/dashboard<\/a>/);
  // Links inside a sentence stay inline and don't swallow the trailing comma.
  assert.match(html, /See <a href="https:\/\/qb\.test\/games\/naga"[^>]*>https:\/\/qb\.test\/games\/naga<\/a>, or reply\./);
  assert.match(html, /— Quest Board/);
});

test("HTML email: nothing in the text can inject markup or attributes", () => {
  const html = emailHtml('"><script>x</script>', 'Name: <img src=x onerror=alert(1)>\n\nhttps://qb.test/a"onmouseover="x');
  assert.doesNotMatch(html, /<script>|<img|"onmouseover/); // no tag, no attribute breaking out of href="…"
  assert.match(html, /href="https:\/\/qb\.test\/a&quot;onmouseover=&quot;x"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
