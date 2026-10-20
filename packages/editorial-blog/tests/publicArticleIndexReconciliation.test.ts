import type { PublicArticleSummary } from "../publicArticleIndex";
import { expect, test } from "vitest";
import { comparePublicArticleIndexes, createPublicArticleIndexReconciliation } from "../publicArticleIndexReconciliation";
const row = { id: "article", storyId: "story", title: "Praça", slug: "praca", mediaIds: [], publishedAt: 100, updatedAt: 101 };
test("reports count, IDs, fields and order without dumping editorial content", () => {
  expect(comparePublicArticleIndexes([row], [{ ...row, title: "Other" }])).toEqual(["field: article.title"]);
  expect(comparePublicArticleIndexes([row], [])).toEqual(["count: canonical=1 index=0", "missing: article"]);
  expect(comparePublicArticleIndexes([row], [{ ...row, id: "extra" }])).toEqual(["missing: article", "extra: extra", "order: article IDs differ"]);
});
test("rebuilds idempotently including an empty catalog, and read-only comparison does not write", async () => {
  let projection: PublicArticleSummary[] = [row];
  const operation = createPublicArticleIndexReconciliation({ listCanonical: async () => [], replace: async (rows) => {
    projection = rows;
  }, listProjection: async () => projection });
  expect(await operation.run(false)).toEqual(["count: canonical=0 index=1", "extra: article"]);
  expect(projection).toEqual([row]);
  expect(await operation.run(true)).toEqual([]);
  expect(await operation.run(true)).toEqual([]);
});
