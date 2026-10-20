// @vitest-environment node
import { describe, expect, test } from "vitest";
import { correctMediaMetadataSchema } from "../mediaCorrectionPolicy";

const correction = {
  mediaId: "media-1",
  expectedRevision: 1,
  metadata: { alt: "Sede", caption: "Prefeitura", provenance: { origin: "own-production", displayBasis: "own-production", creator: "Ana", credit: "Foto: Ana", acquiredAt: 1 } },
  reason: "Corrigir autoria",
  idempotencyKey: "request-1",
};

describe("media correction policy", () => {
  test("normalizes opaque references and the reason without changing metadata", () => {
    expect(correctMediaMetadataSchema.parse({ ...correction, mediaId: " media-1 ", idempotencyKey: " request-1 ", reason: " Corrigir autoria " })).toEqual(correction);
    expect(correctMediaMetadataSchema.parse({ ...correction, idempotencyKey: undefined })).toEqual({
      ...correction,
      idempotencyKey: undefined,
    });
  });

  test.each([0, -1, 1.5, "1", null])("refuses a nonpositive or noninteger revision %s", (expectedRevision) => {
    expect(correctMediaMetadataSchema.safeParse({ ...correction, expectedRevision }).success).toBe(false);
  });

  test.each(["", " ", "nested/id", "x".repeat(201)])("refuses invalid opaque identifiers %s", (value) => {
    for (const field of ["mediaId", "idempotencyKey"]) {
      expect(correctMediaMetadataSchema.safeParse({ ...correction, [field]: value }).success).toBe(false);
    }
  });

  test("accepts the maximum identifier and reason lengths", () => {
    expect(correctMediaMetadataSchema.parse({ ...correction, mediaId: "x".repeat(200), idempotencyKey: "y".repeat(200), reason: "r".repeat(1000) })).toMatchObject({ mediaId: "x".repeat(200), idempotencyKey: "y".repeat(200), reason: "r".repeat(1000) });
  });

  test.each([undefined, "", " ", "r".repeat(1001)])("requires a bounded nonblank reason", (reason) => {
    expect(correctMediaMetadataSchema.safeParse({ ...correction, reason }).success).toBe(false);
  });

  test.each(["storagePath", "mimeType", "status", "kind", "revision"])("refuses canonical or binary field %s", (field) => {
    expect(correctMediaMetadataSchema.safeParse({ ...correction, [field]: "changed" }).success).toBe(false);
    expect(correctMediaMetadataSchema.safeParse({ ...correction, metadata: { ...correction.metadata, [field]: "changed" } }).success).toBe(false);
  });

  test("requires canonical structured provenance", () => {
    expect(correctMediaMetadataSchema.safeParse({ ...correction, metadata: { alt: "Sede", provenance: "Foto: Ana" } }).success).toBe(false);
    expect(correctMediaMetadataSchema.safeParse({ ...correction, metadata: { ...correction.metadata, provenance: { ...correction.metadata.provenance, creator: " " } } }).success).toBe(false);
  });
});
