// The app's connection waits for another writer (a backup, the admin CLI) instead of failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const file = join(mkdtempSync(join(tmpdir(), "qb-lock-")), "test.db");
process.env.QUESTBOARD_DB = file;
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");

test("a write waits while another process holds the write lock, then succeeds", async () => {
  db(); // create the schema first
  const holder = spawn(process.execPath, ["-e", `
    const { DatabaseSync } = require("node:sqlite");
    const d = new DatabaseSync(${JSON.stringify(file)});
    d.exec("BEGIN IMMEDIATE");
    console.log("locked");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    d.exec("COMMIT");
  `]);
  await new Promise((resolve) => holder.stdout.once("data", resolve));
  const started = Date.now();
  db().prepare("INSERT INTO users (email, password_hash, name) VALUES ('waiter@x.test', 'x', 'Waiter')").run();
  assert.ok(Date.now() - started >= 200, "it waited for the lock");
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'waiter@x.test'").get() as { n: number }).n, 1);
  await new Promise((resolve) => holder.once("exit", resolve));
});
