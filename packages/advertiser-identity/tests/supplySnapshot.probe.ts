import { strict as assert } from "node:assert";
import type { createSupplySnapshotExport } from "../supplySnapshot";
export async function run(module: { createSupplySnapshotExport: typeof createSupplySnapshotExport }) {
  const files = new Map<string, string>();
  const snapshot = module.createSupplySnapshotExport({
    store: { read: async () => ({ ads: [{ id: "ad", status: "active", createdAt: 1 }], identities: [], enabledCatalogs: new Set(), activityAreas: { isActive: async () => true } }) },
    destination: { exists: async date => files.has(date), write: async (date, csv) => void files.set(date, csv) },
  });
  assert.deepEqual(await snapshot.run(Date.UTC(2026, 9, 24, 12)), { snapshotDate: "2026-10-24", written: true, ads: 1, identities: 0 });
}
