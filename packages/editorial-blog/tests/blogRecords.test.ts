import { expect, test } from "vitest";
import { blogHeaderMediaIds, blogPublicationReceipt, legacyBlogContent, uniqueSources } from "../blogRecords";
import type { BlogPost } from "../blog";

const post = (fields: Partial<BlogPost> = {}): BlogPost => ({
  id: "post", status: "published", revision: 2, mediaIds: [], createdAt: 1, updatedAt: 10, publishedAt: 5,
  content: { title: "Título", body: "Texto.", path: "/noticia/post/titulo", media: [], sources: [] }, ...fields,
});

test("legacy content keeps the pre-role gallery only without a lead", () => {
  expect(legacyBlogContent("antigo", { title: "T", body: "B", slug: "t", mediaIds: ["a", "b"] }))
    .toEqual({ title: "T", body: "B", path: "/noticia/antigo/t", media: [], sources: [], legacyHeaderMediaIds: ["a", "b"] });
  expect(legacyBlogContent("antigo", { title: "T", body: "B", slug: "t", mediaIds: ["a"], leadMediaId: "a" }).legacyHeaderMediaIds).toEqual([]);
});

test("header Media ignores inline body uses", () => {
  const content = { ...post().content, body: "![media](media:inline)" };
  expect(blogHeaderMediaIds(content, { mediaIds: ["inline"] })).toEqual([]);
  expect(blogHeaderMediaIds(post().content, { mediaIds: ["gallery"] })).toEqual(["gallery"]);
});

test("sources cited twice appear once in first-citation order", () => {
  expect(uniqueSources([{ name: "A", url: "a" }, { name: "B" }, { name: "A", url: "a" }, { name: "A" }]))
    .toEqual([{ name: "A", url: "a" }, { name: "B" }, { name: "A" }]);
});

test("the receipt marks a public update only after a past publication", () => {
  expect(blogPublicationReceipt("post", post(), [], null)).not.toHaveProperty("publicUpdatedAt");
  expect(blogPublicationReceipt("post", post(), [], post({ publishedAt: 5 }))).toMatchObject({ operationId: "blog-post", publicUpdatedAt: 10, corrections: [] });
  expect(blogPublicationReceipt("post", post(), [], post({ publishedAt: 20 }))).not.toHaveProperty("publicUpdatedAt");
});
