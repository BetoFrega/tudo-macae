import { describe, expect, test } from "vitest";
import { articleMediaUseIds, formatArticleMediaReference, parseArticleBodyMediaReferences, resolveArticleMediaReferences } from "../articleMediaBody";

describe("Article body media references", () => {
  test("reads canonical image identities in document order and ignores code and raw HTML", () => {
    const body = [
      "Antes",
      "![media](media:photo-1)",
      "`![media](media:inline)`",
      "```md",
      "![media](media:fenced)",
      "```",
      "<img src=\"media:html\" />",
      "![ordinary](https://example.test/image.jpg)",
      "![escaped](media:escaped\\-id)",
    ].join("\n\n");
    expect(parseArticleBodyMediaReferences(body).map(({ mediaId }) => mediaId))
      .toEqual(["photo-1", "escaped-id"]);
    expect(articleMediaUseIds({ body, leadMediaId: "photo-1" }))
      .toEqual(["photo-1", "escaped-id"]);
  });

  test("formats stable references and rejects malformed identities", () => {
    expect(formatArticleMediaReference("media_123")).toBe("![media](media:media_123)");
    expect(() => formatArticleMediaReference("../private")).toThrow();
  });

  test("keeps a shared lead and inline identity once and rejects missing uses", () => {
    const references = [
      { mediaId: "photo-1", expectedRevision: 2 },
      { mediaId: "photo-2", expectedRevision: 4 },
      { mediaId: "unused", expectedRevision: 1 },
    ];
    expect(resolveArticleMediaReferences({
      body: "![media](media:photo-1)\n\n![media](media:photo-2)",
      leadMediaId: "photo-1",
      references,
    })).toEqual(references.slice(0, 2));
    expect(() => resolveArticleMediaReferences({
      body: "![media](media:missing)",
      leadMediaId: null,
      references,
    })).toThrow("Selecione cada Mídia usada no corpo ou como principal.");
  });

  test("preserves multiple legacy header images while adding an independent inline image", () => {
    const references = ["old-1", "old-2", "inline"].map(mediaId => ({ mediaId }));
    expect(resolveArticleMediaReferences({
      body: "Texto.\n\n![media](media:inline)",
      legacyHeaderMediaIds: ["old-1", "old-2"],
      references,
    })).toEqual(references);
    expect(articleMediaUseIds({
      body: "```md\n![literal](media:fake)\n```\n\n![media](media:inline)",
      legacyHeaderMediaIds: ["old-1", "old-2"],
    })).toEqual(["old-1", "old-2", "inline"]);
  });

  test("keeps a legacy image removed from the header when the body still references it", () => {
    const references = ["old-1", "old-2"].map(mediaId => ({ mediaId }));
    expect(resolveArticleMediaReferences({
      body: "Texto.\n\n![media](media:old-2)",
      legacyHeaderMediaIds: ["old-1"],
      references,
    })).toEqual(references);
  });

  test("explicitly clearing the lead does not restore legacy header images", () => {
    expect(resolveArticleMediaReferences({
      body: "![media](media:inline)",
      leadMediaId: null,
      legacyHeaderMediaIds: [],
      references: [{ mediaId: "old" }, { mediaId: "inline" }],
    })).toEqual([{ mediaId: "inline" }]);
  });
});
