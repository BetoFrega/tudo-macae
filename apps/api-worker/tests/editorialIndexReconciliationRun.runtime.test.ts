import { afterEach, expect, test, vi } from "vitest";
import { runBlogIndexReconciliation } from "../lib/editorialIndexReconciliation";
import type { EditorialMediaService } from "../lib/mediaHttp";

const article = { kind: "article", id: "post", body: { status: "published", title: "Praia", slug: "praia", updatedAt: 2, publishedAt: 1 } };
function reconcile(options: { bound?: boolean; summaries?: () => Promise<unknown[]> } = {}) {
  const index = { summaries: vi.fn(options.summaries ?? (async () => [])), publish: vi.fn(async (_summary: unknown) => "confirmed"), retire: vi.fn(async () => "confirmed") };
  const persistence = { page: async () => ({ items: [article], version: 1 }), read: async () => article };
  const service = { persistence } as unknown as EditorialMediaService;
  const env = { WORKERS_ENVIRONMENT: "test", ...(options.bound === false ? {} : { ARTICLE_INDEX: index }) } as unknown as Env;
  return { index, run: runBlogIndexReconciliation({ editorialMedia: () => service }, env) };
}
afterEach(() => {
  vi.restoreAllMocks();
});

test("a repaired difference is reported by article ID and field, never by content", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const projected: unknown[] = [];
  const { index, run } = reconcile({ summaries: async () => projected });
  index.publish.mockImplementation(async (summary: unknown) => {
    projected.push(summary);
    return "confirmed";
  });
  await run;
  const event = JSON.parse(String(info.mock.calls[0]![0]));
  // One ID joins this event with the index Worker's failure events for the same writes.
  expect(index.publish).toHaveBeenCalledWith({ id: "post", storyId: "post", title: "Praia", slug: "praia", mediaIds: [], updatedAt: 2, publishedAt: 1 }, event.correlationId);
  expect(event.correlationId).toEqual(expect.any(String));
  expect(index.summaries).toHaveBeenCalledWith(event.correlationId);
  expect(event).toMatchObject({ event: "public_article_index_reconciliation", outcome: "repaired", found: 2, differences: ["count: canonical=1 index=0", "missing: post"], remaining: [] });
  expect(JSON.stringify(event)).not.toContain("Praia");
});

test("an unreachable index fails the run and says so", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(reconcile({ summaries: async () => Promise.reject(new TypeError("unbound")) }).run).rejects.toBeInstanceOf(TypeError);
  expect(JSON.parse(String(error.mock.calls[0]![0]))).toMatchObject({ outcome: "failed", errorName: "TypeError" });
});

test("an unbound index fails the run instead of skipping it", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(reconcile({ bound: false }).run).rejects.toMatchObject({ name: "ArticleIndexUnbound" });
  expect(JSON.parse(String(error.mock.calls[0]![0]))).toMatchObject({ outcome: "failed", errorName: "ArticleIndexUnbound" });
});
