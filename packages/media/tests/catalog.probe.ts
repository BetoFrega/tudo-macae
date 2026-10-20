import type * as entry from "../catalog";

export async function run(module: typeof entry) {
  const catalog = module.createMediaCatalog({ now: () => 1000, store: {
    create: async () => "media", ensure: async id => id, read: async () => null,
    revisions: async () => [], transition: async () => ({ transitioned: 0, alreadyCanonical: 0 }),
  } });
  const input = { status: "staged" as const, storagePath: "media/file.webp", mimeType: "image/webp",
    metadata: { kind: "article-image" as const, alt: "Praia", caption: "", provenance: {
      origin: "own-production" as const, creator: "Equipe", credit: "Equipe",
      displayBasis: "own-production" as const, acquiredAt: 1,
    } } };
  await catalog.register(input);
  await catalog.get("media");
  await catalog.byIds(["media"]);
  await catalog.listRevisions("media");
  await catalog.ensureDemo({ ...input, id: "demo" });
  await catalog.transitionLegacy([]);
}
