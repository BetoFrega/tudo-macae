import type { createAdImageUpload } from "../adImageUpload";

export async function run(module: { createAdImageUpload: typeof createAdImageUpload }) {
  const uploads = module.createAdImageUpload({
    readOwned: async () => ({ categoryId: "category", images: [] }),
    read: async () => ({ categoryId: "category", images: [] }),
    pathFor: () => "ad-images/ad/photo.png",
    store: async () => ({ path: "ad-images/ad/photo.png", created: true }),
    append: async (_id, build) => build([]),
    publish: async () => {},
    finalize: async (_id, imageId, path) => ({ id: imageId, path, order: 0 }),
    remove: async () => {},
    newId: () => "photo",
    reportCleanupFailure: () => {},
  });

  await uploads.upload({
    adId: "ad",
    userId: "owner",
    file: Buffer.from("photo"),
    mimeType: "image/png",
    title: "Photo",
    description: "",
  });
}
