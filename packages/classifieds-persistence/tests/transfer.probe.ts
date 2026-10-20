import type * as entry from "../transfer";
import { createClassifiedsArtifactIndex } from "../records";
export async function run(module: typeof entry) {
  const transfer = module.createClassifiedsTransfer({
    read: async () => null,
    page: async () => ({ items: [], scope: "scope", version: 0 }),
    transact: async (_intent, decide) => ({ value: await decide({ read: async () => null, page: async () => ({ items: [], scope: "scope", version: 0 }), put() {}, remove() {} }), replayed: false }),
    manifest: async () => ({ profile: null, version: 0, adCount: 0, catalogItemCount: 0, imageCount: 0, activeReservations: 0, legacyImages: 0, skippedImages: 0 }),
    deleteIdentity: async input => ({ value: input.result, replayed: false }),
    transferVersion: async () => 0, snapshot: async decide => decide({ read: async () => null }), readReceipt: async () => null, receipts: async () => [],
    importRecord: async () => "imported", importReceipt: async () => "imported",
    expireAudits: async () => 0, adSitemap: async () => [],
  }, createClassifiedsArtifactIndex({ ownsImagePath: () => false, cleanupJobId: path => path }));
  const records = await transfer.exportRecords();
  for await (const _item of records) {}
  await transfer.importItem({ type: "record", record: { kind: "audit", id: "audit", body: {} } });
}
