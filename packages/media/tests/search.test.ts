import { expect, test, vi } from "vitest";
import { createMediaSearch } from "../search";
import type { Media } from "../model";

function media(id: string, createdAt = 1000): Media {
  return {
    id, createdAt, updatedAt: createdAt, status: "staged", revision: 1,
    storagePath: `media/${id}.webp`, mimeType: "image/webp",
    kind: "article-image", alt: "Orla de Macaé", caption: "Barcos no cais",
    provenance: { origin: "own-production", creator: "Equipe", credit: "Foto: João Silva", displayBasis: "own-production", acquiredAt: 1 },
  };
}

test("searches a default page with one extra candidate for continuation", async () => {
  const record = media("first");
  const scan = vi.fn(async () => [record]);
  const search = createMediaSearch({ scan });
  expect(await search.search()).toEqual({ media: [record] });
  expect(scan).toHaveBeenCalledWith({ limit: 21 });
});

test.each([0, 51, 1.5, NaN, Infinity])("rejects invalid page size %s before reading", async (limit) => {
  const scan = vi.fn(async () => []);
  const search = createMediaSearch({ scan });
  await expect(search.search({ limit })).rejects.toThrow("A busca aceita entre 1 e 50 Mídias por página.");
  expect(scan).not.toHaveBeenCalled();
});

test.each([[1, 50], [20, 100], [50, 250]])("scans %s-item text pages with the preserved candidate bound", async (limit, scanLimit) => {
  const matching = media("matching");
  const other = { ...media("other"), alt: "Montanha", caption: "Interior" };
  const scan = vi.fn(async () => [other, matching]);
  const search = createMediaSearch({ scan });
  expect(await search.search({ kind: "article-image", status: "staged", text: "  MACAE ", credit: " JOAO   SILVA ", provenance: "EQUIPE", limit })).toEqual({ media: [matching] });
  expect(scan).toHaveBeenCalledWith({ kind: "article-image", status: "staged", limit: scanLimit });
});

test("continues after the last returned match when more matches remain", async () => {
  const first = media("first", 3000);
  const second = media("second", 2000);
  const scan = vi.fn(async () => [second]).mockResolvedValueOnce([first, second]);
  const search = createMediaSearch({ scan });
  const page = await search.search({ limit: 1 });
  expect(page.media).toEqual([first]);
  expect(page.nextCursor).toEqual(expect.any(String));
  if (!page.nextCursor) throw new Error("Expected continuation cursor");
  const next = await search.search({ limit: 1, cursor: page.nextCursor });
  expect(next.media).toEqual([second]);
  expect(scan).toHaveBeenLastCalledWith({ limit: 2, cursor: { createdAt: 3000, id: "first" } });
});

test("continues an empty filtered page after the last scanned candidate", async () => {
  const candidates = Array.from({ length: 50 }, (_, index) => media(`candidate-${index}`, 1000 - index));
  const scan = vi.fn(async (): Promise<Media[]> => []).mockResolvedValueOnce(candidates);
  const search = createMediaSearch({ scan });
  const page = await search.search({ text: "inexistente", limit: 1 });
  expect(page.media).toEqual([]);
  expect(page.nextCursor).toEqual(expect.any(String));
  if (!page.nextCursor) throw new Error("Expected continuation cursor");
  expect(await search.search({ text: "inexistente", limit: 1, cursor: page.nextCursor })).toEqual({ media: [] });
  expect(scan).toHaveBeenLastCalledWith({ limit: 50, cursor: { createdAt: 951, id: "candidate-49" } });
});

test("the unreferenced report preserves pagination even when every result has a reference", async () => {
  const first = media("first", 3000);
  const second = media("second", 2000);
  const scan = vi.fn(async () => [first, second]);
  const hasReference = vi.fn(async () => true);
  const search = createMediaSearch({ scan });
  const page = await search.reportUnreferenced({ limit: 1 }, { hasReference });
  expect(page.media).toEqual([]);
  expect(page.nextCursor).toEqual(expect.any(String));
  if (!page.nextCursor) throw new Error("Expected continuation cursor");
  expect(scan).toHaveBeenCalledWith({ status: "staged", limit: 2 });
  expect(hasReference).toHaveBeenCalledExactlyOnceWith("first");
  await search.search({ status: "staged", limit: 1, cursor: page.nextCursor });
  expect(scan).toHaveBeenLastCalledWith({ status: "staged", limit: 2, cursor: { createdAt: 3000, id: "first" } });
});

test.each(["text", "credit", "provenance"] as const)("rejects blank %s before reading", async (field) => {
  const scan = vi.fn(async () => []);
  await expect(createMediaSearch({ scan }).search({ [field]: "   " })).rejects.toThrow(TypeError);
  expect(scan).not.toHaveBeenCalled();
});

test.each([{ kind: "" }, { status: "" }, { status: "archived" }])("rejects an unknown filter %o before reading", async (filter) => {
  const scan = vi.fn(async () => []);
  await expect(createMediaSearch({ scan }).search(filter as never)).rejects.toThrow(TypeError);
  expect(scan).not.toHaveBeenCalled();
});

test.each(["invalid", [], null])("rejects the non-object input %o before reading", async (input) => {
  const scan = vi.fn();
  await expect(createMediaSearch({ scan }).search(input as never)).rejects.toThrow(TypeError);
  expect(scan).not.toHaveBeenCalled();
});

test.each(["not-base64-json", "bnVsbA", "e30"])("rejects malformed cursor %s before reading", async (cursor) => {
  const scan = vi.fn(async () => []);
  await expect(createMediaSearch({ scan }).search({ cursor })).rejects.toThrow("O cursor da busca de Mídias é inválido.");
  expect(scan).not.toHaveBeenCalled();
});

test("binds continuation to filters and preserves the existing cursor fields", async () => {
  const scan = vi.fn(async () => [media("first", 3000), media("second", 2000)]);
  const search = createMediaSearch({ scan });
  const page = await search.search({ text: "macaé", limit: 1 });
  if (!page.nextCursor) throw new Error("Expected cursor");
  const decoded = JSON.parse(Buffer.from(page.nextCursor, "base64url").toString());
  expect(decoded).toEqual({ filters: "{\"kind\":null,\"status\":null,\"text\":\"macae\",\"credit\":null,\"provenance\":null}", createdAt: 3000, id: "first" });
  await expect(search.search({ text: "cais", cursor: page.nextCursor })).rejects.toThrow("O cursor da busca de Mídias é inválido.");
  for (const fields of [{ createdAt: "yesterday" }, { id: "" }, { id: 123 }]) {
    const cursor = Buffer.from(JSON.stringify({ ...decoded, ...fields })).toString("base64url");
    await expect(search.search({ text: "macae", cursor })).rejects.toThrow("O cursor da busca de Mídias é inválido.");
  }
  expect(scan).toHaveBeenCalledTimes(1);
});

test.each([
  { text: "CAIS" }, { credit: "  JOAO   SILVA " }, { provenance: "EQUIPE" },
])("filters each textual dimension independently: %j", async (input) => {
  const matching = media("matching");
  const other = { ...media("other"), alt: "Montanha", caption: "Interior", provenance: { ...matching.provenance, creator: "Fotógrafa", credit: "Foto: Maria" } };
  const search = createMediaSearch({ scan: async () => [other, matching] });
  expect(await search.search(input)).toEqual({ media: [matching] });
});

test("the unreferenced report keeps its staged filter whatever the caller sends", async () => {
  const scan = vi.fn(async () => []);
  await createMediaSearch({ scan }).reportUnreferenced({ status: "active" } as never, { hasReference: async () => false });
  expect(scan).toHaveBeenCalledWith(expect.objectContaining({ status: "staged" }));
});

test("reports unreferenced results and propagates reader failures", async () => {
  const record = media("first");
  const search = createMediaSearch({ scan: async () => [record] });
  expect(await search.reportUnreferenced({}, { hasReference: async () => false })).toEqual({ media: [record] });
  const failure = new Error("read unavailable");
  await expect(search.reportUnreferenced({}, { hasReference: async () => {
    throw failure;
  } })).rejects.toBe(failure);
  const failing = createMediaSearch({ scan: async () => {
    throw failure;
  } });
  await expect(failing.search()).rejects.toBe(failure);
  await expect(failing.reportUnreferenced({}, { hasReference: async () => false })).rejects.toBe(failure);
});
