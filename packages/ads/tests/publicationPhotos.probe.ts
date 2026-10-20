import type { createPublicationPhotos, discardedPublicationPhoto } from "../publicationPhotos";
export async function run(module: { createPublicationPhotos: typeof createPublicationPhotos; discardedPublicationPhoto: typeof discardedPublicationPhoto }) {
  const photos = module.createPublicationPhotos({ transact: async (_id, decide) => decide([]) });
  await photos.sync({ id: "draft", operationId: "11111111-1111-4111-8111-111111111111", images: [], observedImages: [] });
  module.discardedPublicationPhoto({ path: "owned/stage", ownerKind: "ad", ownerId: "draft", pendingPublication: true, status: "reserved" }, "draft", []);
}
