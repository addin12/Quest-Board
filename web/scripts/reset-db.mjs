// Deletes the SQLite database so it is recreated and re-seeded on next boot, and (optionally) empties
// an uploads folder that belongs with it (the e2e servers each have their own).
// Usage: node scripts/reset-db.mjs [path] [uploads-dir]   (defaults to data/questboard.db)
import { rmSync } from "node:fs";

const file = process.argv[2] ?? process.env.QUESTBOARD_DB ?? "data/questboard.db";
for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
const uploads = process.argv[3];
if (uploads) rmSync(uploads, { recursive: true, force: true });
console.log(`Reset ${file}${uploads ? ` and ${uploads}` : ""} — it will be re-seeded on next start.`);
