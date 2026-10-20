import { expect, test, vi } from "vitest";
import { createMediaCatalog, type MediaCatalogDependencies } from "@tudomacae/media/catalog";

const input = { status: "staged" as const, storagePath: "media/file.webp", mimeType: "image/webp",
  metadata: { kind: "article-image" as const, alt: "Praia", caption: "", provenance: {
    origin: "own-production" as const, creator: "Equipe", credit: "Equipe",
    displayBasis: "own-production" as const, acquiredAt: 1,
  } } };
function fixture() {
  const store: MediaCatalogDependencies["store"] = {
    create: vi.fn(async () => "media"), ensure: vi.fn(async id => id), read: vi.fn(async () => null),
    revisions: vi.fn(async () => []), transition: vi.fn(async () => ({ transitioned: 0, alreadyCanonical: 0 })),
  };
  return { store, catalog: createMediaCatalog({ now: () => 1000, store }) };
}

test("registers validated Media with one clock value and preserves legacy demo metadata", async () => {
  const { catalog, store } = fixture();
  await expect(catalog.register(input)).resolves.toBe("media");
  expect(store.create).toHaveBeenCalledWith({ ...input.metadata, status: "staged", storagePath: "media/file.webp",
    mimeType: "image/webp", revision: 1, createdAt: 1000, updatedAt: 1000 });
  await expect(catalog.ensureDemo({ ...input, id: " demo " })).resolves.toBe("demo");
  expect(store.ensure).toHaveBeenCalledWith("demo", expect.objectContaining({ createdAt: 1000, revision: 1 }));
});

test("rejects malformed registration and blank identities asynchronously before persistence", async () => {
  const { catalog, store } = fixture();
  await expect(catalog.register({ ...input, metadata: { ...input.metadata, alt: " " } })).rejects.toThrow();
  await expect(catalog.get(" ")).rejects.toThrow("Informe uma Mídia válida.");
  await expect(catalog.listRevisions(" ")).rejects.toThrow("Informe uma Mídia válida.");
  await expect(catalog.ensureDemo({ ...input, id: " " })).rejects.toThrow("Informe uma Mídia de demonstração válida.");
  expect(store.create).not.toHaveBeenCalled();
  expect(store.read).not.toHaveBeenCalled();
  expect(store.revisions).not.toHaveBeenCalled();
  expect(store.ensure).not.toHaveBeenCalled();
});

test("normalizes every requested identity before reads and enforces the batch limit", async () => {
  const { catalog, store } = fixture();
  await expect(catalog.byIds([" first ", " second "])).resolves.toEqual([]);
  expect(store.read).toHaveBeenNthCalledWith(1, "first");
  expect(store.read).toHaveBeenNthCalledWith(2, "second");
  vi.mocked(store.read).mockClear();
  await expect(catalog.byIds(["valid", " "])).rejects.toThrow("Informe uma Mídia válida.");
  await expect(catalog.byIds(Array(51).fill("id"))).rejects.toThrow("A leitura aceita no máximo 50 Mídias por vez.");
  expect(store.read).not.toHaveBeenCalled();
});

test("refuses an invalid migration plan before the adapter can write", async () => {
  const { catalog, store } = fixture();
  const plan = { id: "id", status: "staged" as const, legacyProvenance: "Arquivo", provenance: input.metadata.provenance };
  await expect(catalog.transitionLegacy([plan, plan])).rejects.toThrow("aparece duas vezes");
  expect(store.transition).not.toHaveBeenCalled();
});
