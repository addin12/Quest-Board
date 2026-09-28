// Pure: what a notification links to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeNotification, type NotificationSource } from "../../src/lib/notification-view.ts";
import { makeT } from "../../src/lib/i18n/dict.ts";

const t = makeT("en");
const base: NotificationSource = {
  id: 1, kind: "lfg_reply", created_at: "2026-09-28T00:00:00.000Z", read_at: null, actor_name: "Sari", actor_hue: 10, actor_image: null,
  request_id: null, request_title: null, game_title: null, game_slug: null, post_id: 7, post_title: "Need two players",
};

test("board notifications open the notice — or the board, once the notice was removed", () => {
  assert.equal(describeNotification(base, t).href, "/board/7");
  for (const kind of ["lfg_reply", "lfg_thread_reply", "notice_expiring"] as const) {
    assert.equal(describeNotification({ ...base, kind, post_title: null }, t).href, "/board", kind);
  }
});

test("game notifications open the game — or My games, once the game was archived", () => {
  const g = { ...base, kind: "seat_removed" as const, post_id: null, post_title: null, game_title: "Naga", game_slug: "naga" };
  assert.equal(describeNotification(g, t).href, "/games/naga");
  assert.equal(describeNotification({ ...g, game_status: "archived" }, t).href, "/dashboard");
  assert.equal(describeNotification(g, t).text, "The GM released your seat in a session of Naga");
});
