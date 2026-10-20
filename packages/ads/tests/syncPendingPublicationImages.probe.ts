import { strict as assert } from "node:assert";
import type { createPendingPublicationImageSync } from "../syncPendingPublicationImages";

export async function run(module: { createPendingPublicationImageSync: typeof createPendingPublicationImageSync }) {
  const id = "00000000-0000-4000-8000-000000000001";
  const imageId = "00000000-0000-4000-8000-000000000002";
  const image = { id: imageId, path: `ad-images/${id}/${imageId}.png`, title: "Frente", description: "", order: 0 };
  const sync = module.createPendingPublicationImageSync({
    pathFor: (publicationId, uploadId) => `ad-images/${publicationId}/pending/${uploadId}.png`,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async () => ({ id, userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [image] }),
    upload: async () => { throw new Error("Unexpected upload"); },
    replace: async (_id, _userId, _updatedAt, _operationId, build) => ({ images: build([image]), cleanupPaths: [] }),
    remove: async () => { throw new Error("Unexpected removal"); },
    scheduleCleanup: async () => { throw new Error("Unexpected cleanup scheduling"); },
    claimCleanup: async () => false,
    acknowledgeCleanup: async () => { throw new Error("Unexpected cleanup acknowledgment"); },
    now: () => 2,
  });
  const form = new FormData();
  form.set("observedImages", JSON.stringify([image]));
  form.set("images", JSON.stringify([{ id: imageId, title: "Frente", description: "", order: 0 }]));
  assert.deepEqual(await sync.sync("owner", id, form), [image]);
}
