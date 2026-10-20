import { describe, expect, test } from "vitest";
import { articleHeaderMediaIds, resolveLegacyHeaderMediaIds } from "../articleMediaRoles";

describe("article media roles", () => {
  test("resolves effective header use without changing the stored legacy gallery", () => {
    expect(articleHeaderMediaIds({ mediaIds: ["old-a", "old-b", "inline"] }))
      .toEqual(["old-a", "old-b", "inline"]);
    expect(articleHeaderMediaIds({
      mediaIds: ["old-a", "old-b", "inline"],
      legacyHeaderMediaIds: ["old-a", "old-b"],
    })).toEqual(["old-a", "old-b"]);
    expect(articleHeaderMediaIds({ mediaIds: ["old-a", "inline"], leadMediaId: "old-a", legacyHeaderMediaIds: ["old-a"] }))
      .toEqual(["old-a"]);
    expect(articleHeaderMediaIds({ mediaIds: ["old-a", "inline"], leadMediaId: null, legacyHeaderMediaIds: ["old-a"] }))
      .toEqual([]);
  });

  test("keeps an explicitly empty legacy gallery and preserves media-only replacement order", () => {
    expect(resolveLegacyHeaderMediaIds({ mediaIds: ["old-a", "inline"], legacyHeaderMediaIds: [], bodyHasMedia: false }))
      .toEqual([]);
    expect(resolveLegacyHeaderMediaIds({ mediaIds: ["old-a", "inline"], legacyHeaderMediaIds: ["old-a"], bodyHasMedia: true }))
      .toEqual(["old-a"]);
    expect(resolveLegacyHeaderMediaIds({ mediaIds: ["new-b", "new-a"], legacyHeaderMediaIds: [], replaceFromMedia: true }))
      .toEqual(["new-b", "new-a"]);
  });

  test("does not infer a header from body-only media when legacy state is absent", () => {
    expect(resolveLegacyHeaderMediaIds({ mediaIds: ["inline"], bodyHasMedia: true })).toEqual([]);
    expect(resolveLegacyHeaderMediaIds({ mediaIds: ["old-a", "old-b"], bodyHasMedia: false }))
      .toEqual(["old-a", "old-b"]);
  });
});
