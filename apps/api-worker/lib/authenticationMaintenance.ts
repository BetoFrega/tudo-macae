/** Tables whose rows stop working at `expiresAt`, in milliseconds. */
const expiringTables = ["session", "verification", "password_recovery", "email_confirmation"] as const;
const dayMs = 24 * 60 * 60 * 1000;
const batchSize = 500;
const batchesPerTable = 8;

/**
 * The Privacy Policy promises that expired sessions and codes are deleted within one day of expiring.
 * Each hourly run removes at most 4,000 rows per table; a larger backlog drains over later runs.
 */
export async function runAuthenticationMaintenance(database: D1Database, environment: string | undefined, now: number) {
  const cutoff = now - dayMs;
  const removed: Record<string, number> = {};
  for (const table of expiringTables) {
    removed[table] = 0;
    for (let batch = 0; batch < batchesPerTable; batch++) {
      const result = await database
        .prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expiresAt<=? LIMIT ${batchSize})`)
        .bind(cutoff)
        .run();
      removed[table] += result.meta.changes;
      if (result.meta.changes < batchSize) break;
    }
  }
  if (Object.values(removed).some(Boolean))
    console.info(JSON.stringify({ event: "authentication.expiry", service: "api-worker", environment: environment ?? "unknown", outcome: "completed", removed }));
}
