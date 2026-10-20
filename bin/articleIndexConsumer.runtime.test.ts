import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { createArticleIndexTestRuntime, TEST_ARTICLE_INDEX_ORIGIN } from "./articleIndexTestRuntime";
import { createPublicArticleIndexClient } from "../src/packages/editorial/publicArticleIndexClient";
import { createArticleSitemap } from "../src/packages/editorial/articleSitemap";
import { PublicArticleIndexFailure, publicArticleIndexFailureEvent } from "../src/packages/editorial/publicArticleIndexFailure";

let runtime: Awaited<ReturnType<typeof createArticleIndexTestRuntime>>;
let bearer: string;
beforeAll(async () => {
  runtime = await createArticleIndexTestRuntime();
  bearer = await runtime.identityToken(TEST_ARTICLE_INDEX_ORIGIN);
});
afterAll(async () => {
  await runtime?.dispose();
});
function request(path: string, method = "GET", body?: unknown) {
  return runtime.request(`${TEST_ARTICLE_INDEX_ORIGIN}${path}`, { method,
    headers: { "authorization": `Bearer ${bearer}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const row = { id: "article", storyId: "story", title: "Praça aberta", slug: "praca-aberta", mediaIds: ["media"], publishedAt: 100, updatedAt: 101 };

test("the sitemap reads the authenticated D1 projection and surfaces Worker failures with sanitized telemetry", async () => {
  await request("/snapshot", "POST", [row]);
  const client = createPublicArticleIndexClient({ origin: TEST_ARTICLE_INDEX_ORIGIN,
    identityToken: runtime.identityToken, request: runtime.request });
  const sitemap = createArticleSitemap({ listProjection: () => client.list(100) });
  expect(await sitemap.list()).toEqual([row]);

  const events: unknown[] = [];
  const unauthorized = createPublicArticleIndexClient({ origin: TEST_ARTICLE_INDEX_ORIGIN,
    identityToken: async () => "invalid-token", request: runtime.request });
  const unavailable = createArticleSitemap({ listProjection: () => unauthorized.list(100),
    failed: error => events.push(publicArticleIndexFailureEvent({ operation: "projection", environment: "test", release: "test", error })) });
  await expect(unavailable.list()).rejects.toEqual(new PublicArticleIndexFailure("response", 401));
  expect(events).toEqual([{ event: "public_article_index_failure", service: "nextjs", environment: "test", release: "test",
    outcome: "failure", operation: "projection", failure: "response", statusClass: "4xx" }]);
});

test("a failed production sitemap read correlates the app and Worker failure records", async () => {
  const { listSitemapArticles } = await import("../src/packages/editorial/articleSitemapProduction");
  const failedRuntime = await createArticleIndexTestRuntime(undefined, true);
  const bearer = await failedRuntime.identityToken(TEST_ARTICLE_INDEX_ORIGIN);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("PUBLIC_ARTICLE_INDEX_URL", TEST_ARTICLE_INDEX_ORIGIN);
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "metadata.google.internal") return new Response(bearer);
    if (url.origin !== TEST_ARTICLE_INDEX_ORIGIN) throw new Error("Unexpected network request");
    return failedRuntime.request(request);
  });
  try {
    await expect(listSitemapArticles()).rejects.toMatchObject({ category: "response", status: 503 });
    const events = log.mock.calls.map(([value]) => JSON.parse(value));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: "public_article_index_worker", route: "/summaries", correlationId: expect.any(String) });
    expect(events[1]).toMatchObject({ event: "public_article_index_failure", operation: "projection", correlationId: events[0].correlationId });
    expect(events[0].correlationId).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    expect(JSON.stringify(events)).not.toContain(bearer);
  }
  finally {
    await failedRuntime.dispose();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    log.mockRestore();
  }
});

test("a failed bound summaries read is the index Worker's own storage failure", async () => {
  const failedRuntime = await createArticleIndexTestRuntime(undefined, true);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await failedRuntime.rpc("summaries", "reconciliation-run")).error).toBeDefined();
    const events = log.mock.calls.flatMap(([value]) => {
      try {
        return [JSON.parse(String(value))];
      }
      catch {
        return [];
      }
    });
    expect(events).toContainEqual(expect.objectContaining({ event: "public_article_index_worker", route: "ArticleIndexWriter.summaries", failure: "storage", correlationId: "reconciliation-run" }));
  }
  finally {
    await failedRuntime.dispose();
    log.mockRestore();
  }
});
