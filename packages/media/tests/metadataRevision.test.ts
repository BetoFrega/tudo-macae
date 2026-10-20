import { expect, test, vi } from "vitest";
import { createMediaMetadataRevision, type MediaMetadataRevisionDependencies } from "../metadataRevision";
import type { Media } from "../model";

const original: Media = {
  id: "media", revision: 1, status: "active", createdAt: 10, updatedAt: 20,
  storagePath: "media/image.webp", mimeType: "image/webp", digest: "digest",
  kind: "article-image", alt: "Legenda anterior", caption: "Antes",
  provenance: { origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1 },
};
const metadata = { kind: "article-image" as const, alt: "Orla corrigida", caption: "Depois", provenance: original.provenance };
const input = { id: "media", expectedRevision: 1, actorId: "editor", metadata };

test("archives previous metadata and advances the revision at one instant", async () => {
  const archive = vi.fn();
  const update = vi.fn();
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: {
    transact: async decide => decide({ read: async () => original, archive, update }),
  } });
  await expect(revisions.update(input)).resolves.toBeUndefined();
  expect(archive).toHaveBeenCalledExactlyOnceWith({
    mediaId: "media", revision: 1,
    metadata: { kind: "article-image", alt: "Legenda anterior", caption: "Antes", provenance: original.provenance },
    replacedAt: 1000, replacedBy: "editor",
  });
  expect(update).toHaveBeenCalledExactlyOnceWith("media", { metadata, revision: 2, updatedAt: 1000 });
});

test("rejects a missing Media without archiving or updating", async () => {
  const archive = vi.fn();
  const update = vi.fn();
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: {
    transact: async decide => decide({ read: async () => null, archive, update }),
  } });
  await expect(revisions.update(input)).rejects.toMatchObject({ name: "MediaNotFoundError", message: "A Mídia informada não existe." });
  expect(archive).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test("rejects a stale revision without overwriting history", async () => {
  const archive = vi.fn();
  const update = vi.fn();
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: {
    transact: async decide => decide({ read: async () => ({ ...original, revision: 2 }), archive, update }),
  } });
  await expect(revisions.update(input)).rejects.toMatchObject({ name: "MediaRevisionConflictError", message: "A Mídia mudou desde a revisão esperada.", currentRevision: 2 });
  expect(archive).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test.each([
  { ...input, id: " " }, { ...input, actorId: " " }, { ...input, expectedRevision: 0 },
  { ...input, metadata: { ...metadata, alt: " " } },
])("validates input before opening a transaction: %j", async (invalid) => {
  const transact = vi.fn<MediaMetadataRevisionDependencies["store"]["transact"]>(async decide => decide({ read: async () => original, archive: () => {}, update: () => {} }));
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: { transact } });
  await expect(revisions.update(invalid)).rejects.toThrow();
  expect(transact).not.toHaveBeenCalled();
});

test("coordinates in the supplied transaction and returns the final Media", async () => {
  const transact = vi.fn<MediaMetadataRevisionDependencies["store"]["transact"]>(async () => ({ status: "updated" as const, media: original }));
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: { transact } });
  const archive = vi.fn();
  const update = vi.fn();
  expect(await revisions.coordinate({ read: async () => original, archive, update }, input)).toEqual({
    status: "updated",
    media: { ...original, ...metadata, revision: 2, updatedAt: 1000 },
  });
  expect(archive).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
  expect(transact).not.toHaveBeenCalled();
});

test.each([
  { current: null, expected: { status: "not-found" } },
  { current: { ...original, revision: 2 }, expected: { status: "conflict", currentRevision: 2 } },
])("coordinates a rejected revision without effects: %j", async ({ current, expected }) => {
  const archive = vi.fn();
  const update = vi.fn();
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: { transact: async () => ({ status: "updated" as const, media: original }) } });
  expect(await revisions.coordinate({ read: async () => current, archive, update }, input)).toEqual(expected);
  expect(archive).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test("re-evaluates the winning revision when the transaction retries", async () => {
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: {
    transact: async (decide) => {
      await decide({ read: async () => original, archive: () => {}, update: () => {} });
      const archive = vi.fn();
      const update = vi.fn();
      const result = await decide({ read: async () => ({ ...original, revision: 2 }), archive, update });
      expect(archive).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      return result;
    },
  } });
  await expect(revisions.update(input)).rejects.toMatchObject({ name: "MediaRevisionConflictError", currentRevision: 2 });
});

test("normalizes identifiers and preserves revision advancement for unchanged metadata", async () => {
  const read = vi.fn(async () => original);
  const archive = vi.fn();
  const update = vi.fn();
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: {
    transact: async decide => decide({ read, archive, update }),
  } });
  const unchanged = { kind: original.kind, alt: original.alt, caption: original.caption, provenance: original.provenance };
  await revisions.update({ ...input, id: " media ", actorId: " editor ", metadata: unchanged });
  expect(read).toHaveBeenCalledExactlyOnceWith("media");
  expect(archive).toHaveBeenCalledWith(expect.objectContaining({ replacedBy: "editor" }));
  expect(update).toHaveBeenCalledExactlyOnceWith("media", { metadata: unchanged, revision: 2, updatedAt: 1000 });
});

test("rejects invalid coordinated input before reading the supplied transaction", async () => {
  const read = vi.fn(async () => original);
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: { transact: async () => ({ status: "updated", media: original }) } });
  await expect(revisions.coordinate({ read, archive: () => {}, update: () => {} }, { ...input, expectedRevision: 0 })).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});

test("propagates transaction and reader failures", async () => {
  const failure = new Error("transaction unavailable");
  const revisions = createMediaMetadataRevision({ now: () => 1000, store: { transact: async () => {
    throw failure;
  } } });
  await expect(revisions.update(input)).rejects.toBe(failure);
  await expect(revisions.coordinate({ read: async () => {
    throw failure;
  }, archive: () => {}, update: () => {} }, input)).rejects.toBe(failure);
});
