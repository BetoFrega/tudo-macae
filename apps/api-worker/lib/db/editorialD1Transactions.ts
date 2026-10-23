import { PersistenceConflict, PersistenceLimit, type RecordInput } from "@tudomacae/editorial-persistence";
import { byteLength, persistenceLimits, stableJson } from "@tudomacae/editorial-persistence/records";
import { createD1Transactions as createSharedD1Transactions } from "./d1Transactions";
import { codec, isGuardConflict, pointScope, type D1Statements, type Epoch } from "./editorialD1Statements";
import type { createD1Reads } from "./editorialD1Reads";
import type { createD1Receipts } from "./editorialD1Receipts";

export function createD1Transactions(
  { sql, epochSql, batch, guard }: D1Statements,
  { readPoint, page }: ReturnType<typeof createD1Reads>,
  { replay, receipt }: ReturnType<typeof createD1Receipts>,
) {
  function write(record: RecordInput) {
    return [sql(`INSERT INTO editorial_records (kind, namespace, id, body, version, source_version)
      VALUES (?, ?, ?, ?, lower(hex(randomblob(16))), ?)
      ON CONFLICT(kind, namespace, id) DO UPDATE SET body = excluded.body, version = excluded.version, source_version = excluded.source_version`,
    record.kind, record.namespace ?? "", record.id, stableJson(record.body), record.sourceVersion ?? null)];
  }
  return createSharedD1Transactions({
    Conflict: PersistenceConflict, Limit: PersistenceLimit, limits: persistenceLimits, stableJson, byteLength,
    codec, pointScope, readPoint, page, guard, isGuardConflict, replay, receipt, write,
    epochs: async scopes => (await batch(scopes.map(epochSql), "read")).map(result => (result.results[0] as Epoch).version),
    commit: statements => batch(statements, "commit"),
    remove: (kind, id, namespace) => sql("DELETE FROM editorial_records WHERE kind = ? AND namespace = ? AND id = ?", kind, namespace, id),
    releaseAssertions: token => sql("DELETE FROM editorial_assertions WHERE token = ?", token),
  });
}
