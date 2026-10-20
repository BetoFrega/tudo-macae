import { strict as assert } from "node:assert";
import type { createBusinessReader } from "../business";
export async function run(module: { createBusinessReader: typeof createBusinessReader }) {
  const profile = { id: "business", title: "Negócio", userId: "owner", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }], createdAt: 1, updatedAt: 1 };
  const reader = module.createBusinessReader({ store: { getById: async () => profile }, activityAreas: { isActive: async () => true } });
  assert.equal((await reader.read({ id: profile.id }))?.title, profile.title);
}
