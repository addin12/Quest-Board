import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SCHEMA_SQL, SCHEMA_VERSION } from "../../src/lib/schema.ts";
import { backup, inspect, restore } from "../../scripts/db-backup.mjs";

function makeDb(file: string, users: number) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA_SQL);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  for (let i = 0; i < users; i++) db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', 'User')").run(`u${i}@x.test`);
  db.close();
}

test("backup: checked copy, newest N kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "qb-backup-"));
  const live = join(dir, "live.db");
  makeDb(live, 3);
  for (let i = 0; i < 4; i++) backup(live, join(dir, "b"), 2, new Date(Date.UTC(2026, 8, 26, 10, 0, i)));
  const kept = readdirSync(join(dir, "b")).filter((f) => f.endsWith(".db")).sort();
  assert.deepEqual(kept, ["questboard-20260926-100002.db", "questboard-20260926-100003.db"]);
  assert.equal(inspect(join(dir, "b", kept[1])).users, 3);
});

test("restore: keeps the current database, refuses files that aren't Quest Board databases", () => {
  const dir = mkdtempSync(join(tmpdir(), "qb-restore-"));
  const live = join(dir, "questboard.db");
  const old = join(dir, "old.db");
  makeDb(old, 1);
  makeDb(live, 5);
  const r = restore(old, live, new Date(Date.UTC(2026, 8, 26, 12, 0, 0)));
  assert.equal(inspect(live).users, 1);
  assert.ok(r.saved?.endsWith("questboard.before-restore-20260926-120000.db"));
  assert.equal(inspect(r.saved!).users, 5);
  const junk = join(dir, "junk.db");
  writeFileSync(junk, "not a database");
  assert.throws(() => restore(junk, live));
  const empty = join(dir, "empty.db");
  new DatabaseSync(empty).close();
  assert.throws(() => restore(empty, live), /not a Quest Board database/);
});

test("uploaded pictures are mirrored with each backup and put back by a restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "qb-pictures-"));
  const live = join(dir, "questboard.db");
  const pics = join(dir, "uploads");
  makeDb(live, 2);
  mkdirSync(pics);
  const a = "a".repeat(32) + ".webp", b = "b".repeat(32) + ".webp";
  writeFileSync(join(pics, a), "A");
  writeFileSync(join(pics, "notes.txt"), "not a picture"); // never copied
  const first = backup(live, join(dir, "b"), 5, new Date(Date.UTC(2026, 8, 28, 1, 0, 0)), pics);
  assert.equal(first.pictures, 1);
  writeFileSync(join(pics, b), "B");
  const second = backup(live, join(dir, "b"), 5, new Date(Date.UTC(2026, 8, 28, 2, 0, 0)), pics);
  assert.equal(second.pictures, 1); // only the new one
  assert.deepEqual(readdirSync(join(dir, "b", "uploads")).sort(), [a, b]);

  rmSync(pics, { recursive: true }); // the server's disk was lost
  const r = restore(second.file, live, new Date(Date.UTC(2026, 8, 28, 3, 0, 0)), pics);
  assert.equal(r.pictures, 2);
  assert.ok(existsSync(join(pics, a)) && existsSync(join(pics, b)));
});
