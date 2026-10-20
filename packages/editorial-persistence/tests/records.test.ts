import { describe, expect, test } from "vitest";
import { PersistenceLimit } from "../index";
import { createEditorialRecordCodec, encodeReceiptRecord, stableJson } from "../records";

const codec = createEditorialRecordCodec();

describe("editorial record codec", () => {
  test("keeps legacy fields of a stored article", () => {
    const record = { kind: "article", id: "post", body: { status: "awaitingPublication", createdAt: 1, storyId: "story", legacyHeaderMediaIds: ["m"] } };
    expect(codec.parse(record)).toEqual(record);
  });

  test("scopes revisions by Media and legacy records by source collection only", () => {
    expect(codec.key("mediaRevision", "2", "media")).toEqual({ kind: "mediaRevision", id: "2", namespace: "media" });
    expect(() => codec.key("mediaRevision", "2")).toThrow(TypeError);
    expect(() => codec.key("media", "media", "scope")).toThrow(TypeError);
    expect(() => codec.key("legacy", "story", "news stories")).toThrow();
    expect(() => codec.parse({ kind: "mediaRevision", namespace: "media", id: "2", body: { revision: 3 } })).toThrow(TypeError);
  });

  test("rejects non-epoch timestamps and incomplete grants", () => {
    expect(() => codec.parse({ kind: "article", id: "post", body: { status: "draft", createdAt: 1, publishedAt: 1.5 } })).toThrow();
    expect(() => codec.parse({ kind: "publicationGrant", id: "g", body: { articleId: "post", mediaId: "m" } })).toThrow();
  });

  test("bounds a record to the D1 row envelope", () => {
    expect(() => codec.parse({ kind: "activity", id: "a", body: { text: "x".repeat(1_000_001) } })).toThrow(PersistenceLimit);
  });

  test("encodes intents and results independently of key order", () => {
    const first = encodeReceiptRecord({ intent: { actorId: "a", key: "k", operation: "save", input: { b: 1, a: 2 } }, result: { y: 1, x: 2 } });
    const second = encodeReceiptRecord({ intent: { actorId: "a", key: "k", operation: "save", input: { a: 2, b: 1 } }, result: { x: 2, y: 1 } });
    expect(first.encodedIntent).toBe(second.encodedIntent);
    expect(first.encodedResult).toBe(stableJson({ x: 2, y: 1 }));
  });
});
