// The engineering rules in CLAUDE.md that a test can check. If one fails, the message says which rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";

const web = fileURLToPath(new URL("../../", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs)$/.test(n) ? [p] : [];
  });

test("no placeholder logic: no TODO, FIXME or XXX left in src/ or scripts/", () => {
  const found = [...files(join(web, "src")), ...files(join(web, "scripts"))].flatMap((f) =>
    readFileSync(f, "utf8").split("\n").flatMap((line, i) => (/\b(TODO|FIXME|XXX)\b/.test(line) ? [`${f.slice(web.length)}:${i + 1}`] : [])),
  );
  assert.deepEqual(found, [], "finish it, or write it down in IMPROVEMENTS.md instead");
});

test("every foreign key has an index that starts with it (lookups and cascading deletes)", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
  const missing: string[] = [];
  for (const t of tables) {
    const first = new Set<string>();
    for (const ix of db.prepare(`PRAGMA index_list(${t})`).all() as { name: string }[]) {
      const cols = db.prepare(`PRAGMA index_info(${ix.name})`).all() as { seqno: number; name: string }[];
      const lead = cols.sort((a, b) => a.seqno - b.seqno)[0];
      if (lead) first.add(lead.name);
    }
    for (const c of db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; pk: number }[]) if (c.pk === 1) first.add(c.name);
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { from: string; table: string }[]) {
      if (!first.has(fk.from)) missing.push(`${t}.${fk.from} → ${fk.table}`);
    }
  }
  assert.deepEqual(missing, [], "add CREATE INDEX for these (schema.ts and a migration)");
});

test("secrets are compared in constant time: no === on a token, secret or signature", () => {
  const risky = /\b(token|secret|signature|apiKey|password)\w*\s*(===|!==)\s*(?!null\b|undefined\b|""|''|\d)/i;
  const found = files(join(web, "src")).flatMap((f) =>
    readFileSync(f, "utf8").split("\n").flatMap((line, i) => (risky.test(line) && !/typeof|\.length/.test(line) ? [`${f.slice(web.length)}:${i + 1}: ${line.trim()}`] : [])),
  );
  assert.deepEqual(found, [], "use timingSafeEqual / sameSecret (lib/secret-compare.ts)");
});
