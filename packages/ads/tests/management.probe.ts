import { strict as assert } from "node:assert";
import type { createAdManagement } from "../management";
import type { AdData } from "../types";

export async function run(module: { createAdManagement: typeof createAdManagement }) {
  let record: AdData | null = null;
  const ads = module.createAdManagement({
    store: {
      async create(fields) {
        record = { ...fields, id: "ad", createdAt: 100 };
        return "ad";
      },
      async getById() { return record; },
      async getAll() { return record ? [record] : []; },
      async getByUserId() { return record ? [record] : []; },
      async getActiveByProfileId() { return record ? [record] : []; },
      async getPendingImageCleanupPaths() { return []; },
      async delete() { record = null; },
    },
    async removeDirectory() {},
  });
  await ads.create({ userId: "owner", advertiserProfileId: "profile", categoryId: "category", subcategoryId: "subcategory", title: "Serviço em Macaé", text: "Descrição do serviço oferecido na cidade" });
  assert.equal((await ads.read({ id: "ad" }))?.slug, "servico-em-macae");
  assert.equal((await ads.readOwned({ id: "ad", userId: "owner" })).userId, "owner");
  assert.equal((await ads.listAll()).length, 1);
  assert.equal((await ads.listForUser({ userId: "owner" })).length, 1);
  assert.equal((await ads.listForProfile({ profileId: "profile" })).length, 1);
  await ads.delete({ id: "ad" });
  assert.equal(await ads.read({ id: "ad" }), null);
}
