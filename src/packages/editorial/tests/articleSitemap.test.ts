import { expect, test } from "vitest";
import { createArticleSitemap } from "../articleSitemap";

test("a projection failure is reported and rejects the sitemap", async () => {
  const error = new Error("worker unavailable");
  const failures: unknown[] = [];
  const sitemap = createArticleSitemap({
    listProjection: async () => { throw error; },
    failed: failure => failures.push(failure),
  });
  await expect(sitemap.list()).rejects.toBe(error);
  expect(failures).toEqual([error]);
});

test("returns the current projection URLs in their original order", async () => {
  const sitemap = createArticleSitemap({ listProjection: async () => [
    { id: "newer", slug: "praca-reformada" },
    { id: "older", slug: "praca-aberta" },
  ] });
  expect(await sitemap.list()).toEqual([
    { id: "newer", slug: "praca-reformada" },
    { id: "older", slug: "praca-aberta" },
  ]);
});
