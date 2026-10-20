import type { createPhotoInventory } from "../inventory";
export async function run(module: { createPhotoInventory: typeof createPhotoInventory }) {
  await module.createPhotoInventory({
    newId: () => "00000000-0000-4000-8000-000000000000", digest: async () => "a".repeat(64),
    read: async object => ({ bytes: new Uint8Array(), generation: object.generation, mimeType: object.mimeType }), save: async () => {},
  }).generate({ owners: [], objects: [], retiredPaths: [], cleanupPaths: [] });
}
