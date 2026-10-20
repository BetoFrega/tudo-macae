import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { createD1IdentityDeletion } from "./classifiedsD1IdentityDeletion";
import { createD1Reads } from "./classifiedsD1Reads";
import { createD1Receipts } from "./classifiedsD1Receipts";
import { createD1Statements, type D1PersistenceDependencies, type Epoch } from "./classifiedsD1Statements";
import { createD1Transactions } from "./classifiedsD1Transactions";

export function createD1ClassifiedsPersistence(dependencies: D1PersistenceDependencies): ClassifiedsPersistence {
  const statements = createD1Statements(dependencies);
  const { epochSql, batch } = statements;
  const reads = createD1Reads(statements);
  const { readPoint, page, adSitemap } = reads;
  const receipts = createD1Receipts(statements);
  const { transact, importRecord, snapshot } = createD1Transactions(statements, reads, receipts);
  const { manifest, deleteIdentity, expireAudits } = createD1IdentityDeletion(statements, receipts);
  return {
    read: async (kind, id, namespace) => (await readPoint(kind, id, namespace)).record, snapshot, page, adSitemap, transact, manifest, deleteIdentity,
    importRecord, importReceipt: receipts.importReceipt, readReceipt: receipts.readReceipt, receipts: receipts.receipts, expireAudits,
    transferVersion: async () => ((await batch([epochSql("[\"all\"]")], "read"))[0]!.results[0] as Epoch).version,
  };
}
