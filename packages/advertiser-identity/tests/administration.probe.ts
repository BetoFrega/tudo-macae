import { strict as assert } from "node:assert";
import type { createAdvertiserProfileAdministration as createAdministration } from "../administration";

export async function run(module: { createAdvertiserProfileAdministration: typeof createAdministration }) {
  const result = {
    outcome: "created" as const,
    replayed: false,
    profileId: "profile",
    revision: 1,
    effects: { previousActivityAreas: [], activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }] },
  };
  const administration = module.createAdvertiserProfileAdministration({
    now: () => 1,
    digestConfirmationEvidence: evidence => evidence,
    store: {
      async list() { return { items: [] }; },
      async get() {
        return {
          id: "profile", claimable: true, source: { url: "https://example.com", checkedAt: 1 },
          title: "Perfil", description: "", contacts: [], activityAreas: [], revision: 1, createdAt: 1, updatedAt: 1,
        };
      },
      async findDuplicates() { return { items: [] }; },
      async create() { return result; },
      async update() { return { ...result, outcome: "updated" }; },
      async delete() { return { ...result, outcome: "deleted" }; },
    },
  });
  assert.deepEqual(await administration.list({}), { items: [] });
  assert.equal((await administration.get({ id: "profile" })).id, "profile");
  assert.deepEqual(await administration.findDuplicates({ title: "Perfil", contacts: [{ number: "22999999999", isWhatsapp: true }] }), { items: [] });
  const common = { idempotencyKey: "operation", actorId: "admin", channel: "mcp" as const };
  assert.equal((await administration.create({
    ...common,
    title: "Perfil", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }], sourceUrl: "https://example.com",
  })).outcome, "created");
  assert.equal((await administration.update({ ...common, id: "profile", expectedRevision: 1, patch: { description: "Nova" } })).outcome, "updated");
  assert.equal((await administration.delete({ ...common, id: "profile", expectedRevision: 1 })).outcome, "deleted");
}
