import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { persistenceLimits } from "@tudomacae/editorial-persistence/records";
import { createD1Reads } from "./editorialD1Reads";
import { createD1Receipts } from "./editorialD1Receipts";
import { createD1Statements, type D1PersistenceDependencies } from "./editorialD1Statements";
import { createD1Transactions } from "./editorialD1Transactions";

export function createD1EditorialPersistence(dependencies: D1PersistenceDependencies): EditorialPersistence {
  const statements = createD1Statements(dependencies);
  const reads = createD1Reads(statements);
  const receipts = createD1Receipts(statements);
  const { transact, importRecord, snapshot } = createD1Transactions(statements, reads, receipts);
  async function expireActivity(now: number) {
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Data inválida.");
    const results = await statements.batch([statements.sql(`DELETE FROM editorial_records WHERE rowid IN (
      SELECT rowid FROM editorial_records INDEXED BY editorial_activity_expiry WHERE kind = 'activity' AND json_extract(body, '$.expiresAt') <= ?
      ORDER BY json_extract(body, '$.expiresAt'), rowid LIMIT ?
    ) RETURNING id`, now, persistenceLimits.commands)], "expireActivity");
    return results[0]!.results.length;
  }
  return {
    read: async (kind, id, namespace) => (await reads.readPoint(kind, id, namespace)).record,
    page: reads.page, snapshot, transact, importRecord,
    readReceipt: receipts.readReceipt, importReceipt: receipts.importReceipt, expireActivity,
  };
}
