import { expect, test } from "vitest";
import { createPublicMediaContent } from "../publicMediaContent";
import type { PublicationReadState } from "../publishedArticle";
import type { MediaPublicationGrant } from "@tudomacae/media/publicationGrants";

const digest = "a".repeat(64);
const grant: MediaPublicationGrant = { operationId: "receipt", articleId: "article", mediaId: "photo", revision: 1, digest };
const state = (status = "published", publishedAt = 100): PublicationReadState => ({
  managed: true,
  article: { status, publishedAt, receiptId: "receipt" },
  receipt: { status: "completed", operationId: "receipt", articleId: "article", grants: [grant] } as PublicationReadState["receipt"],
  grants: [grant],
});

test.each(["media", "grants", "publication", "storage"])("reports the bounded %s failure stage without private exception text", async (stage) => {
  async function read<T>(name: string, result: T): Promise<T> {
    if (stage === name) throw new Error("private-storage-path");
    return result;
  }
  const reader = createPublicMediaContent({
    now: () => 200,
    readMedia: () => read("media", { status: "active" as const, digest, storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp" }),
    readGrants: () => read("grants", [grant]),
    readPublication: () => read("publication", state()),
    readContent: () => read("storage", { bytes: new Uint8Array([1]), mimeType: "image/webp" }),
  });
  await expect(reader.read("photo", digest)).rejects.toMatchObject({ stage, message: "Editorial image dependency failed" });
});

test("shared Media remains public until its last valid published use is withdrawn", async () => {
  let publication = state();
  const reader = createPublicMediaContent({
    now: () => 200,
    readMedia: async () => ({ status: "active", digest, storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp" }),
    readGrants: async () => [grant, { ...grant, articleId: "withdrawn" }],
    readPublication: async id => id === "article" ? publication : state("offAir"),
    readContent: async () => ({ bytes: new Uint8Array([1, 2]), mimeType: "image/webp" }),
  });
  expect(await reader.read("photo", digest)).toEqual({ bytes: new Uint8Array([1, 2]), mimeType: "image/webp" });
  publication = state("offAir");
  expect(await reader.read("photo", digest)).toBeNull();
});

test("reads each Article once per request despite historical grants and rechecks withdrawal", async () => {
  let publication = state();
  let publicationReads = 0;
  const reader = createPublicMediaContent({
    now: () => 200,
    readMedia: async () => ({ status: "active", digest, storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp" }),
    readGrants: async () => [...Array.from({ length: 10 }, (_, index) => ({ ...grant, operationId: `old-${index}` })), grant],
    readPublication: async () => {
      publicationReads++;
      return publication;
    },
    readContent: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/webp" }),
  });
  expect(await reader.read("photo", digest)).toMatchObject({ mimeType: "image/webp" });
  expect(publicationReads).toBe(1);
  publication = state("offAir");
  expect(await reader.read("photo", digest)).toBeNull();
  expect(publicationReads).toBe(2);
});

test.each(["staged", "future", "invalidGrant", "wrongDigest", "invalidReceipt"])("denies %s without reading private bytes", async (reason) => {
  let reads = 0;
  const publication = state("published", reason === "future" ? 300 : 100);
  if (reason === "invalidReceipt") publication.article!.receiptId = "other";
  const reader = createPublicMediaContent({
    now: () => 200,
    readMedia: async () => ({ status: reason === "staged" ? "staged" : "active", digest, storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp" }),
    readGrants: async () => [{ ...grant, digest: reason === "invalidGrant" ? "b".repeat(64) : digest }],
    readPublication: async () => publication,
    readContent: async () => {
      reads++;
      return { bytes: new Uint8Array([1]), mimeType: "image/webp" };
    },
  });
  expect(await reader.read("photo", reason === "wrongDigest" ? "b".repeat(64) : digest)).toBeNull();
  expect(reads).toBe(0);
});
