import { expect, test } from "vitest";
import { createArticleDistribution, type PublicArticleIndexCandidate } from "../articleDistribution";

const candidate: PublicArticleIndexCandidate = { id: "article", storyId: "story", title: "Praça", slug: "praca", mediaIds: [], status: "published", publishedAt: 100, updatedAt: 101 };
test("keeps the canonical save successful when public distribution fails and permits a safe repeat", async () => {
  let fail = true;
  const publicRows = new Map<string, unknown>();
  const distribution = createArticleDistribution({
    readCandidate: async () => candidate,
    apply: async (row) => {
      if (fail) throw new Error("D1 unavailable");
      publicRows.set(row.id, row);
    },
  });
  expect(await distribution.synchronize("article")).toEqual({ status: "unconfirmed" });
  fail = false;
  expect(await distribution.synchronize("article")).toEqual({ status: "confirmed" });
  expect(await distribution.synchronize("article")).toEqual({ status: "confirmed" });
  expect(publicRows.size).toBe(1);
});
