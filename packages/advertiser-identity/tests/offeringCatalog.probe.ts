import { createOfferingCatalog, type OfferingCatalogState } from "../offeringCatalog";
export async function run(module: {
  createOfferingCatalog: typeof createOfferingCatalog;
}) {
  let state: OfferingCatalogState = { enabled: false, revision: 0, items: [] };
  const catalog = module.createOfferingCatalog({
    store: { read: async () => state, transact: async (_id, change) => {
      state = change(state, { ownerId: "owner", claimable: false }).state;
      return state;
    } },
    flag: async () => "enabled", isPublicBusiness: async () => true, now: () => 1000, newId: () => "item",
  });
  const input = { businessId: "business", actor: { id: "owner", admin: true } };
  await catalog.readManagement(input);
  await catalog.saveItem({ ...input, expectedRevision: 0, item: { name: "Item", price: { mode: "on_request" } } });
  await catalog.setVisibility({ ...input, expectedRevision: 1, itemId: "item", visible: true });
  await catalog.setEnablement({ ...input, expectedRevision: 2, enabled: true, operationId: "operation" });
  await catalog.readPublic("business");
}
