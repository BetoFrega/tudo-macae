import type * as entry from "../search";

export async function run(module: typeof entry) {
  const search = module.createMediaSearch({ scan: async () => [{
    id: "media", createdAt: 1, updatedAt: 1, revision: 1, status: "staged",
    kind: "article-image", alt: "Orla", caption: "", storagePath: "media/file.webp", mimeType: "image/webp",
    provenance: { origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1 },
  }] });
  if ((await search.search({ text: "orla" })).media.length !== 1) throw new Error("Search failed");
  if ((await search.reportUnreferenced({}, { hasReference: async () => false })).media.length !== 1) throw new Error("Report failed");
}
