import "server-only";
import { db } from "./db";
import type { ErrorRow } from "./error-shape";

export function recordError(row: ErrorRow): void {
  db()
    .prepare("INSERT INTO error_log (message, digest, method, path, route_path, route_type) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.message, row.digest, row.method, row.path, row.route_path, row.route_type);
}

export type ErrorGroup = { message: string; route_path: string; count: number; last_at: string; last_path: string; digest: string };

/** The last 30 days, grouped by message + route, most recent first. */
export function listErrorGroups(limit = 100): ErrorGroup[] {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  return db()
    .prepare(
      `SELECT message, route_path, COUNT(*) AS count, MAX(created_at) AS last_at,
              (SELECT path FROM error_log x WHERE x.message = e.message AND x.route_path = e.route_path ORDER BY x.id DESC LIMIT 1) AS last_path,
              (SELECT digest FROM error_log x WHERE x.message = e.message AND x.route_path = e.route_path ORDER BY x.id DESC LIMIT 1) AS digest
         FROM error_log e WHERE created_at >= ? GROUP BY message, route_path ORDER BY last_at DESC LIMIT ?`,
    )
    .all(since, limit) as ErrorGroup[];
}

export function countRecentErrors(days = 7): number {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return (db().prepare("SELECT COUNT(*) AS n FROM error_log WHERE created_at >= ?").get(since) as { n: number }).n;
}

export function pruneErrorLog(days = 30): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return Number(db().prepare("DELETE FROM error_log WHERE created_at < ?").run(cutoff).changes);
}
