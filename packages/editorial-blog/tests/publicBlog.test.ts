import { expect, test } from "vitest";
import type { Media } from "@tudomacae/media/model";
import { createPublicBlog, type PublicArticle, type PublicBlogDependencies } from "../publicBlog";

const digest = "a".repeat(64);
function media(id: string, status: Media["status"] = "active"): Media {
  return { id, kind: "article-image", status, revision: 1, digest, storagePath: `media/sha256-${digest}.webp`, mimeType: "image/webp",
    createdAt: 1, updatedAt: 1, alt: `Alt ${id}`, caption: `Legenda ${id}`,
    provenance: { origin: "third-party", displayBasis: "permission", provider: "Prefeitura", permissionReference: "permission", creator: "Ana", credit: "Foto: Ana", acquiredAt: 1 } } as Media;
}
function article(overrides: Partial<PublicArticle> = {}): PublicArticle {
  return { id: "old", storyId: "story", title: "Praça", slug: "praca", body: "Texto.", mediaIds: ["one", "two"],
    status: "published", publishedAt: 50, publishedBy: "editor", corrections: [], createdAt: 1, updatedAt: 2, ...overrides };
}
function blog(overrides: Partial<PublicBlogDependencies> = {}) {
  const library = [media("one"), media("two", "staged"), media("three")];
  return createPublicBlog({
    now: () => 100,
    readPublication: async () => ({ managed: false, article: null, receipt: null, grants: [] }),
    readArticle: async id => (id === "old" ? article() : null),
    readMedia: async ids => ids.flatMap(id => library.filter(item => item.id === id)),
    readStory: async () => ({ occurredAt: 40 }),
    readSources: async () => [{ id: "source", name: "Prefeitura", url: "https://example.com" }],
    readEditorName: async uid => (uid === "editor" ? "Ana Editora" : null),
    listPublished: async () => ({ items: [] }),
    ...overrides,
  });
}

test("an article without a receipt shows its active, referenced Media with story, sources and editor", async () => {
  const { publishedBy: _publishedBy, ...publicFields } = article();
  const read = await blog().article("old");
  expect(read.kind === "legacy" && read.article).not.toHaveProperty("publishedBy");
  expect(read).toEqual({
    kind: "legacy", article: publicFields,
    media: [{ id: "one", digest, alt: "Alt one", caption: "Legenda one", credit: "Foto: Ana", generated: false }],
    story: { occurredAt: 40 }, sources: [{ id: "source", name: "Prefeitura", url: "https://example.com" }], editorName: "Ana Editora",
  });
});

test.each([
  ["a draft", article({ status: "draft" })],
  ["a scheduled post", article({ publishedAt: 200 })],
  ["a missing article", null],
])("%s without a receipt is not public", async (_label, stored) => {
  expect(await blog({ readArticle: async () => stored }).article("old")).toEqual({ kind: "unavailable" });
});

test("a managed article answers only from its receipt, never from the stored article", async () => {
  const reader = blog({ readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 50 }, receipt: null, grants: [] }) });
  expect(await reader.article("old")).toEqual({ kind: "unavailable" });
});

test("an identifier outside the article ID shape reads nothing", async () => {
  let reads = 0;
  const reader = blog({ readPublication: async () => {
    reads++;
    return { managed: false, article: null, receipt: null, grants: [] };
  } });
  expect(await reader.article("../old")).toEqual({ kind: "unavailable" });
  expect(reads).toBe(0);
});

test("a page item carries its first header Media only when it is active and referenced", async () => {
  const listed = [
    article({ id: "lead", leadMediaId: "three", mediaIds: ["three"], publicationReceiptId: "blog-lead" }),
    article({ id: "staged", leadMediaId: "two", mediaIds: ["two"] }),
    article({ id: "gallery", legacyHeaderMediaIds: ["one", "three"], mediaIds: ["one", "three"] }),
    article({ id: "foreign", leadMediaId: "one", mediaIds: [] }),
  ];
  const cursors: Array<[number, string | undefined]> = [];
  const reads: string[][] = [];
  const library = [media("one"), media("two", "staged"), media("three")];
  const reader = blog({ readMedia: async (ids) => {
    reads.push(ids);
    return ids.flatMap(id => library.filter(item => item.id === id));
  }, listPublished: async (at, cursor) => {
    cursors.push([at, cursor]);
    return { items: listed, nextCursor: "foreign" };
  } });
  const page = await reader.page("gallery");
  expect(page.nextCursor).toBe("foreign");
  expect(page.items.map(item => [item.id, item.lead?.id])).toEqual([["lead", "three"], ["staged", undefined], ["gallery", "one"], ["foreign", undefined]]);
  // Only the displayed image of a legacy gallery is read.
  expect(reads).toEqual([["three"], ["two"], ["one"], ["one"]]);
  expect(page.items[0]).toMatchObject({ title: "Praça", slug: "praca", publishedAt: 50, publicationReceiptId: "blog-lead" });
  await reader.page("../invalid");
  expect(cursors).toEqual([[100, "gallery"], [100, undefined]]);
});

test("a published edition keeps each correction's summary and time, never the editor's account ID", async () => {
  const content = { title: "Praça", body: "Texto.", path: "/noticia/old/praca", sources: [], media: [] };
  const reader = blog({ readPublication: async () => ({
    managed: true, article: { status: "published", receiptId: "operation", publishedAt: 50 },
    receipt: { operationId: "operation", articleId: "old", status: "completed", content, grants: [], corrections: [{ summary: "Ajuste", createdAt: 60, editorId: "editor" }] }, grants: [],
  }) });
  const article = await reader.article("old");
  expect(article).toMatchObject({ kind: "published", content: { corrections: [{ summary: "Ajuste", createdAt: 60 }] } });
  expect(JSON.stringify(article)).not.toContain("editor\"");
});
