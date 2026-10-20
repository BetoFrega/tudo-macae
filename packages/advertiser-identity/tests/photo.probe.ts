import { strict as assert } from "node:assert";
import type { createProfilePhotoUpload } from "../photo";
export async function run(module: { createProfilePhotoUpload: typeof createProfilePhotoUpload }) {
  const record = { id: "profile", userId: "owner", title: "Perfil", description: "", createdAt: 1, updatedAt: 1 };
  const upload = module.createProfilePhotoUpload({
    profiles: { async read() { return record; },
      async verifyOwnership() { return record; }, async replacePhoto() {
      } },
    storage: { async upload() { return { path: "photo.webp" }; }, async delete() {}, url: path => path },
    async purgeOldPhoto() { return true; },
    async prepareOldPhoto() {},
    async cancelOldPhoto() {},
    observeRevocation() {},
    reportError() {},
  });
  assert.deepEqual(await upload.upload({ profileId: "profile", userId: "owner", isAdmin: false, expectedRevision: 1, file: new File(["image"], "photo.webp", { type: "image/webp" }) }), { success: true, photoURL: "photo.webp" });
}
