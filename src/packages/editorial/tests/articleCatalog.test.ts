import { expect, test } from "vitest";
import { createArticleCatalog } from "../articleCatalog";

test("public lookup hides future and unapproved Articles and releases at the exact time", async () => {
  let now = 499;
  const article = { id: "article", storyId: "story", title: "Praça", slug: "praca", body: "Texto", mediaIds: [], corrections: [], createdAt: 1, updatedAt: 1, status: "published" as const, publishedAt: 500 };
  const catalog = createArticleCatalog({ now: () => now, read: async () => article, listVisible: async () => [] });
  expect(await catalog.read("article")).toBeNull();
  now = 500;
  expect(await catalog.read("article")).toEqual(article);
});
