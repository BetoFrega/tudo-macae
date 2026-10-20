import { strict as assert } from "node:assert";
import type { createBusinessCatalog } from "../business";

export async function run(module: {
  createBusinessCatalog: typeof createBusinessCatalog;
}) {
  const business = {
    id: "business",
    userId: "owner",
    title: "Café Macaense",
    description: "Café local",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "food", subcategoryId: "cafes" }],
    createdAt: 1,
    updatedAt: 1,
  };
  const catalog = module.createBusinessCatalog({
    activityAreas: { isActive: async () => true },
    store: {
      async getById() {
        return business;
      },
      async listCandidates() {
        return { items: [] };
      },
    },
  });
  assert.equal((await catalog.assess(business)).business?.title, "Café Macaense");
  assert.equal((await catalog.assessMany([business]))[0]?.business?.title, "Café Macaense");
  assert.deepEqual(await catalog.listAll(), []);
  assert.deepEqual(await catalog.listRepresentedActivityAreas(), []);
  assert.deepEqual(await catalog.list({ namePrefix: "cafe" }), { items: [] });
  assert.deepEqual(await catalog.previewCategory({
    categoryId: "food",
    civilDate: "2026-09-20",
  }), []);
  assert.equal((await catalog.read({ id: "business" }))?.title, "Café Macaense");
}
