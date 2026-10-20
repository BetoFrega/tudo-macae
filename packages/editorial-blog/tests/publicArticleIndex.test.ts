import { expect, test } from "vitest";
import { createPublicArticleIndex } from "../publicArticleIndex";

const first = {
  id: "a", storyId: "story-a", title: "Primeira", slug: "primeira", mediaIds: ["media-a"], status: "published", publishedAt: 100, updatedAt: 101,
};
const second = {
  id: "z", storyId: "story-z", title: "Segunda", slug: "segunda", mediaIds: [], status: "published", publishedAt: 100, updatedAt: 102,
};
const older = {
  id: "older", storyId: "story-old", title: "Antiga", slug: "antiga", mediaIds: [], status: "published", publishedAt: 99, updatedAt: 99,
};

test("orders public summaries deterministically and applies the limit after the ordering", async () => {
  const index = createPublicArticleIndex({ listCandidates: async () => [first, older, second] });
  await expect(index.list(100).then(articles => articles.map(article => article.id)))
    .resolves.toEqual([second.id, first.id, older.id]);
  await expect(index.list(100, 2).then(articles => articles.map(article => article.id)))
    .resolves.toEqual([second.id, first.id]);
});

test("decides visibility in the module and uses bytewise IDs for ties", async () => {
  const index = createPublicArticleIndex({ listCandidates: async () => [
    { ...first, id: "a" }, { ...first, id: "A" }, { ...first, id: "z" }, { ...first, id: "Z" },
    { ...first, id: "future", publishedAt: 101 }, { ...first, id: "off-air", status: "offAir" },
  ] });
  await expect(index.list(100).then(articles => articles.map(article => article.id)))
    .resolves.toEqual(["z", "a", "Z", "A"]);
});
