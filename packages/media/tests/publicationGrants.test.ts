import { expect, test } from "vitest";
import { createGrantedMediaContent } from "../publicationGrants";

test("bytes require the exact grant in a completed Article receipt", async () => {
  const grant = { operationId: "operation", submissionId: "submission", articleId: "article", mediaId: "media", revision: 1, digest: "a".repeat(64) };
  let published = false;
  let storedGrant = grant;
  const reader = createGrantedMediaContent({
    readAccess: async () => ({ grant: storedGrant, published, receiptGrants: [grant] }),
    readContent: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" }),
  });
  expect(await reader.read("article", "media")).toBeNull();
  published = true;
  expect(await reader.read("article", "media")).toMatchObject({ mimeType: "image/webp" });
  storedGrant = { ...grant, operationId: "other" };
  expect(await reader.read("article", "media")).toBeNull();
});
