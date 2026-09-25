// Deletes the SQLite database so it is recreated and re-seeded on next boot.
// Usage: node scripts/reset-db.mjs [path]   (defaults to data/questboard.db)
import { rmSync } from "node:fs";

const file = process.argv[2] ?? process.env.QUESTBOARD_DB ?? "data/questboard.db";
for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
console.log(`Reset ${file} — it will be re-seeded on next start.`);
