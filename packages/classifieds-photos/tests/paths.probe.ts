import type { createPhotoPathPolicy } from "../paths";
export async function run(module: { createPhotoPathPolicy: typeof createPhotoPathPolicy }) {
  const paths = module.createPhotoPathPolicy(async () => "a".repeat(64));
  const directory = await paths.directory("ad", "negócio 1");
  await paths.owns({ ownerKind: "ad", ownerId: "negócio 1", path: `${directory}photo.webp` });
}
