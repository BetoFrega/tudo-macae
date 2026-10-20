import { strict as assert } from "node:assert";
import type { createPendingPublicationTransitions } from "../pendingPublicationTransitions";

export async function run(module: { createPendingPublicationTransitions: typeof createPendingPublicationTransitions }) {
  const result = { adId: "ad", slug: "bicicleta", categoryId: "bikes", subcategoryId: "used", advertiserProfileId: "profile" };
  const transitions = module.createPendingPublicationTransitions({
    cleanupImages: async () => {},
    publish: async () => result,
    read: async () => ({ id: "publication", userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [] }),
    verifyImages: async () => {},
    complete: async () => {},
    returnToPending: async () => {},
    delete: async () => {},
    startDelete: async () => {},
    purgeImages: async () => {},
  });
  assert.deepEqual(await transitions.publish("owner", "publication"), result);
  await transitions.delete("owner", "publication");
}
