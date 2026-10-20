import { strict as assert } from "node:assert";
import type { createAdvertiserProfiles } from "../profiles";
import type { AdvertiserProfileData } from "../model";
export async function run(module: {
  createAdvertiserProfiles: typeof createAdvertiserProfiles;
}) {
  let record: AdvertiserProfileData | null = null;
  const profiles = module.createAdvertiserProfiles({
    now: () => 1,
    digest: value => value,
    ownsAdImagePath: (adId, path) => path.startsWith(`ad-images/${adId}/`),
    newCorrelationId: () => "profile-delete-probe",
    reportImageCleanupSkipped: () => {},
    store: {
      async create(input, validate) {
        await validate({ isActive: async () => true });
        record = { ...input, id: "profile" };
        return "profile";
      },
      async update(_id, fields, validate) {
        await validate?.({ isActive: async () => true });
        if (record) record = { ...record, ...fields };
      },
      async classify() {},
      async getById() {
        return record;
      },
      async getByUserId() {
        return record ? [record] : [];
      },
      async getAll() {
        return record ? [record] : [];
      },
      async getByActivityArea() {
        return record ? [record] : [];
      },
      async updateActivityAreas(_id, update) {
        if (record) {
          record = {
            ...record,
            activityAreas: update(record.activityAreas ?? []),
          };
        }
      },
      async delete() {
        record = null;
      },
      async deleteClaimable(_id, assertDeletionAllowed) {
        assertDeletionAllowed(record, false);
        record = null;
      },
    },
    activityAreaCatalog: {
      async isActive() {
        return true;
      },
    },
  });
  const id = await profiles.create({
    userId: "owner",
    title: "Perfil",
    description: "",
    contacts: [],
  });
  await profiles.update({
    id,
    title: "Editado",
    description: "",
    contacts: [],
  });
  assert.equal((await profiles.read({ id }))?.title, "Editado");
  assert.equal(
    (await profiles.verifyOwnership({ id, userId: "owner" })).id,
    id,
  );
  assert.equal((await profiles.readPublic({ id }))?.title, "Editado");
  assert.equal((await profiles.listForUser("owner")).length, 1);
  assert.equal((await profiles.listAll()).length, 1);
  assert.equal((await profiles.listForActivityArea({ categoryId: "category", subcategoryId: "subcategory" })).length, 0);
  await profiles.removeActivityArea({ categoryId: "category", subcategoryId: "subcategory" });
  await profiles.replacePhoto({ id, photoPath: "photo.webp", expectedRevision: 2 });
  await profiles.delete({ id });
  assert.equal(await profiles.read({ id }), null);
  const claimableId = await profiles.createClaimable({
    title: "Perfil público",
    description: "",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }],
    sourceUrl: "https://example.com/profile",
  });
  assert.equal((await profiles.findDuplicateCandidates({
    title: " perfil público ",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
  }))[0]?.id, claimableId);
  await profiles.updateClaimable({
    id: claimableId,
    title: "Perfil público atualizado",
    description: "",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }],
    sourceUrl: "https://example.com/profile-updated",
  });
  assert.equal((await profiles.readPublic({ id: claimableId }))?.isClaimable, true);
  await profiles.deleteClaimable({ id: claimableId });
  assert.equal(await profiles.read({ id: claimableId }), null);
}
