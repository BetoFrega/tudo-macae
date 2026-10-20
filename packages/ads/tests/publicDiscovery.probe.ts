import { strict as assert } from "node:assert";
import type { createPublicAdDiscovery } from "../publicDiscovery";

export async function run(module: { createPublicAdDiscovery: typeof createPublicAdDiscovery }) {
  const discovery = module.createPublicAdDiscovery({
    store: { read: async () => ({ items: [], scanned: 0, hasMore: false }) },
    taxonomy: async () => [{ id: "category", subcategories: [] }],
  });
  discovery.canonical({ scope: { kind: "all" } });
  const input = await discovery.filtered({ categoryId: "category" });
  assert.deepEqual(await discovery.read(input), { items: [] });
}
