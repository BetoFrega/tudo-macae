import { describe, expect, test } from "vitest";
import { call, now, ok, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime("tests/editorialBlogFixtureWorker.ts");

const digest = (seed: string) => seed.repeat(64).slice(0, 64);
const provenance = { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: now };
function media(id: string, seed: string, status = "staged") {
  return { kind: "media", id, body: {
    kind: "article-image", alt: `Foto ${id}`, caption: `Legenda ${id}`, provenance, status, revision: 1,
    storagePath: `media-staged/sha256-${digest(seed)}.webp`, mimeType: "image/webp", digest: digest(seed), createdAt: now, updatedAt: now,
  } };
}
const legacy = (namespace: string, id: string, body: object) => ({ kind: "legacy", namespace, id, body });
const article = (id: string, body: object) => ({ kind: "article", id, body: { status: "published", title: id, body: "Texto.", slug: id, createdAt: now - 10, updatedAt: now - 10, ...body } });
const readerMedia = (id: string, seed: string) => ({ id, digest: digest(seed), alt: `Foto ${id}`, caption: `Legenda ${id}`, credit: provenance.credit, generated: false });

describe("public article", () => {
  test("serves a Blog post's published edition until it goes offline", async () => {
    await ok("import", [media("lead", "a")]);
    await ok("save", { title: "Praia", body: "Texto de Praia.", leadMediaId: "lead", publish: true });
    expect(await ok("publicArticle", "new-post")).toMatchObject({
      kind: "published", publishedAt: now,
      content: { title: "Praia", path: "/noticia/new-post/praia", media: [readerMedia("lead", "a")], corrections: [] },
    });
    // Not public before its publication instant.
    expect(await ok("publicArticle", "new-post", { now: now - 1 })).toEqual({ kind: "unavailable" });
    // The saved article keeps its text only in `blogContent`, and the page still lists it.
    expect((await ok("publicPage", undefined)).items.map((item: { id: string }) => item.id)).toEqual(["new-post"]);
    await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, { now: now + 1 });
    expect(await ok("publicArticle", "new-post", { now: now + 1 })).toEqual({ kind: "unavailable" });
  });

  test("refuses a receipt whose grant the store does not hold", async () => {
    // A managed article reads as unavailable, never as its stored fields.
    await ok("import", [media("lead", "a", "active"),
      { kind: "publicationReceipt", id: "receipt", body: { operationId: "receipt", articleId: "drift", status: "completed", content: { title: "x", body: "x", path: "/noticia/drift/x", sources: [], media: [readerMedia("lead", "a")] }, grants: [{ operationId: "receipt", articleId: "drift", mediaId: "lead", revision: 1, digest: digest("a") }] } },
      article("drift", { publishedAt: now - 5, publicationReceiptId: "receipt", mediaIds: ["lead"] })]);
    expect(await ok("publicArticle", "drift")).toEqual({ kind: "unavailable" });
  });

  test("renders an article without a receipt from its fields, active Media and imported Redação records", async () => {
    await ok("import", [
      media("one", "a", "active"), media("two", "b", "staged"),
      article("antigo", { publishedAt: now - 5, storyId: "story", publishedBy: "author", mediaIds: ["two", "one"], corrections: [{ summary: "Ajuste", correctedAt: now - 1 }] }),
      legacy("news_stories", "story", { occurredAt: now - 100, captureIds: ["c1", "c2", "c3", "missing"] }),
      legacy("news_captures", "c1", { sourceId: "s1" }),
      legacy("news_captures", "c2", { sourceId: "s1" }),
      legacy("news_captures", "c3", { sourceId: "gone" }),
      legacy("news_sources", "s1", { name: "Prefeitura", canonicalUrl: "https://prefeitura.test" }),
    ]);
    expect(await ok("publicArticle", "antigo", { names: { author: "Ana Lima" } })).toEqual({
      kind: "legacy",
      article: { id: "antigo", storyId: "story", title: "antigo", slug: "antigo", body: "Texto.", mediaIds: ["two", "one"], status: "published",
        legacyHeaderMediaIds: ["two", "one"], corrections: [{ summary: "Ajuste", correctedAt: now - 1 }], createdAt: now - 10, updatedAt: now - 10,
        publishedAt: now - 5 },
      media: [readerMedia("one", "a")],
      story: { occurredAt: now - 100 },
      sources: [{ id: "s1", name: "Prefeitura", canonicalUrl: "https://prefeitura.test" }],
      editorName: "Ana Lima",
    });
    expect((await ok("publicArticle", "antigo")).editorName).toBeNull();
  });

  test.each([
    ["a draft", { status: "draft", publishedAt: now - 5 }],
    ["a scheduled article", { publishedAt: now + 5 }],
  ])("does not serve %s without a receipt", async (_label, body) => {
    await ok("import", [article("antigo", body)]);
    expect(await ok("publicArticle", "antigo")).toEqual({ kind: "unavailable" });
  });

  test.each([7, 0, false, ""])("a receipt pointer %j that is no receipt ID still marks the article managed, so it is unavailable", async (pointer) => {
    await ok("import", [article("pointer", { publishedAt: now - 5, publicationReceiptId: pointer })]);
    expect(await ok("publicArticle", "pointer")).toEqual({ kind: "unavailable" });
  });

  test("a receipt whose stored content is not reader content is a data error, never a page", async () => {
    await ok("import", [
      { kind: "publicationReceipt", id: "receipt", body: { operationId: "receipt", articleId: "corrupt", status: "completed", content: {}, grants: [] } },
      article("corrupt", { publishedAt: now - 5, publicationReceiptId: "receipt" }),
    ]);
    expect((await call("publicArticle", "corrupt")).error).toBeDefined();
  });

  test("a publication claim makes an article without a receipt unavailable", async () => {
    await ok("import", [article("claimed", { publishedAt: now - 5 }), legacy("news_publication_claims", "claimed", {})]);
    expect(await ok("publicArticle", "claimed")).toEqual({ kind: "unavailable" });
  });
});

describe("public page", () => {
  test("lists visible published articles, newest publication first, twenty per page, with the lead Media", async () => {
    const published = Array.from({ length: 21 }, (_, index) => article(`post-${String(index).padStart(2, "0")}`, { publishedAt: now - 100 + index, mediaIds: [] }));
    await ok("import", [
      ...published, media("lead", "a", "active"),
      article("featured", { publishedAt: now - 1, leadMediaId: "lead", mediaIds: ["lead"], publicationReceiptId: "blog-featured" }),
      article("draft", { status: "draft", publishedAt: now - 2 }),
      article("scheduled", { publishedAt: now + 1 }),
    ]);
    const first = await ok("publicPage", undefined);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toEqual({ id: "featured", title: "featured", slug: "featured", publishedAt: now - 1, publicationReceiptId: "blog-featured", lead: readerMedia("lead", "a") });
    expect(first.items.slice(1).map((item: { id: string }) => item.id)).toEqual(published.slice(2).reverse().map(item => item.id));
    expect(first.nextCursor).toBe("post-02");
    const second = await ok("publicPage", first.nextCursor);
    expect(second).toEqual({ items: [
      { id: "post-01", title: "post-01", slug: "post-01", publishedAt: now - 99 },
      { id: "post-00", title: "post-00", slug: "post-00", publishedAt: now - 100 },
    ] });
    // A cursor naming no listed article restarts at the first page.
    expect((await ok("publicPage", "scheduled")).items[0].id).toBe("featured");
  });
});
