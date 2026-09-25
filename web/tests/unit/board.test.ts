import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MAX_SPOTS, noticeTilt, parseNotice, parseReply } from "../../src/lib/board.ts";
import { MIGRATIONS } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";

const good = {
  kind: "lf_players", title: "Two players for Cthulhu", system: "Call of Cthulhu", locationType: "online",
  language: "id", schedule: "Saturday nights", spots: "2", body: "We are three friends and want two more investigators.",
};

test("parseNotice validates both kinds", () => {
  const ok = parseNotice(good);
  assert.ok(ok.ok && ok.value.spots === 2 && ok.value.kind === "lf_players");
  const group = parseNotice({ ...good, kind: "lf_group", spots: "5" });
  assert.ok(group.ok && group.value.spots === 0); // spots only matter when looking for players
  const bad = parseNotice({ ...good, kind: "party", title: "Hi", schedule: "", body: "short", spots: String(MAX_SPOTS + 1), locationType: "in_person", city: "" });
  assert.ok(!bad.ok);
  if (!bad.ok) {
    assert.equal(bad.errors.kind, "v.noticeKind");
    assert.equal(bad.errors.title, "v.requestTitle");
    assert.equal(bad.errors.schedule, "v.schedule");
    assert.equal(bad.errors.body, "v.noticeBody");
    assert.equal(bad.errors.city, "v.city");
  }
  const tooMany = parseNotice({ ...good, spots: "9" });
  assert.ok(!tooMany.ok && tooMany.errors.spots === "v.spots");
});

test("parseReply and the pinned tilt", () => {
  assert.ok(parseReply({ body: "Count me in!" }).ok);
  assert.ok(!parseReply({ body: "x" }).ok);
  assert.ok(!parseReply({ body: "x".repeat(1001) }).ok);
  for (let i = 1; i < 50; i++) assert.ok(Math.abs(noticeTilt(i)) <= 1.5);
  assert.equal(noticeTilt(7), noticeTilt(7));
});

test("migration 12 rebuilds reports (keeping data) to accept notice-board targets, and adds the new tables", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  // Roll back to a v11 shape: old reports CHECK, no board tables or columns.
  db.exec(`DROP TABLE lfg_replies; DROP TABLE lfg_posts; DROP TABLE saved_games; DROP TABLE gm_follows;
    ALTER TABLE games DROP COLUMN announced_at; ALTER TABLE notifications DROP COLUMN game_id; ALTER TABLE notifications DROP COLUMN post_id;
    DROP TABLE reports;`);
  db.exec(MIGRATIONS[10].replace(/ALTER TABLE users ADD COLUMN suspended_at TEXT;|ALTER TABLE notifications ADD COLUMN report_id INTEGER;/g, ""));
  db.exec("INSERT INTO users (id, email, password_hash, name) VALUES (1, 'a@x.test', 'x', 'A'), (2, 'b@x.test', 'x', 'B')");
  db.exec("INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, snapshot, href) VALUES (1, 'review', 9, 2, 'spam', 'old evidence', '/x')");
  assert.throws(() => db.exec("INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, snapshot, href) VALUES (1, 'lfg_post', 1, 2, 'spam', 's', '/b')"), /CHECK/);

  db.exec(MIGRATIONS[12]);
  const kept = db.prepare("SELECT snapshot FROM reports").all() as { snapshot: string }[];
  assert.deepEqual(kept.map((r) => r.snapshot), ["old evidence"]);
  db.exec("INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, snapshot, href) VALUES (1, 'lfg_post', 1, 2, 'spam', 's', '/b')");
  db.exec("INSERT INTO lfg_posts (author_id, kind, title, body, expires_at) VALUES (1, 'lf_group', 'T', 'B', '2099-01-01')");
  assert.throws(() => db.exec("INSERT INTO lfg_posts (author_id, kind, title, body, expires_at) VALUES (1, 'lf_party', 'T', 'B', '2099-01-01')"), /CHECK/);
  db.exec("INSERT INTO gm_follows (follower_id, gm_id) VALUES (1, 2)");
  assert.throws(() => db.exec("INSERT INTO gm_follows (follower_id, gm_id) VALUES (1, 2)"), /UNIQUE|PRIMARY/);
});
