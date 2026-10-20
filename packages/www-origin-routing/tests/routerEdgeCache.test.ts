import { describe, expect, test, vi } from "vitest";
import {
  createWwwOriginRouter,
  type BackgroundWork,
  type EdgeCache,
  type WwwOriginLogEvent,
} from "@tudomacae/www-origin-routing/router";
import { visit, webApplication, workerVersion } from "./routerFixture";

const sitemap = "/sitemaps/anuncios.xml";

/** Ignores expiry: the Workers Cache API applies `max-age` itself. */
function memoryCache(): EdgeCache & { stored: Map<string, Response> } {
  const stored = new Map<string, Response>();
  return {
    stored,
    async match(request) {
      return stored.get(request.url)?.clone();
    },
    async put(request, response) {
      stored.set(request.url, new Response(await response.arrayBuffer(), response));
    },
  };
}

function cachingHarness(application: () => Response, edgeCache: EdgeCache = memoryCache()) {
  const fetchWebWorker = vi.fn(async () => application());
  const log = vi.fn<(event: WwwOriginLogEvent) => void>();
  const pending: Promise<unknown>[] = [];
  const background: BackgroundWork = { waitUntil: promise => pending.push(promise) };
  const router = createWwwOriginRouter({ fetchWebWorker, edgeCache, log });
  return {
    edgeCache, fetchWebWorker, log,
    async fetch(request: Request) {
      const response = await router.fetch(request, background);
      const body = await response.text();
      await Promise.all(pending.splice(0));
      return { response, body };
    },
  };
}

const publicSitemap = () => webApplication("<urlset/>", {
  headers: { "cache-control": "public, max-age=3600", "content-type": "application/xml" },
});

describe("the ad sitemap is kept in the colo cache for the application's max-age", () => {
  test("a second read is served from the cache with its own request id", async () => {
    const { fetch, fetchWebWorker, log } = cachingHarness(publicSitemap);
    const first = await fetch(visit(sitemap, { "cookie": "session=a", "cf-ray": "0123456789abcdef-GRU" }));
    const second = await fetch(visit(sitemap, { "cookie": "session=b", "cf-ray": "fedcba9876543210-GIG" }));
    expect(fetchWebWorker).toHaveBeenCalledTimes(1);
    expect(second.body).toBe(first.body);
    expect(second.response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(second.response.headers.get("x-www-origin")).toBe("terms-workers");
    expect(first.response.headers.get("x-correlation-id")).toBe("0123456789abcdef-GRU");
    expect(second.response.headers.get("x-correlation-id")).toBe("fedcba9876543210-GIG");
    expect(log.mock.calls.at(-1)![0]).toMatchObject({
      edgeCache: "hit", outcome: "success", selectedOrigin: "terms-workers", statusClass: "2xx", termsWorkerVersion: workerVersion,
    });
  });

  test("an entry stored under the bare path is never served", async () => {
    const edgeCache = memoryCache();
    edgeCache.stored.set(`https://www.tudomacae.com.br${sitemap}`, new Response("<urlset>other build</urlset>"));
    const { fetch } = cachingHarness(publicSitemap, edgeCache);
    expect((await fetch(visit(sitemap))).body).toBe("<urlset/>");
  });

  test("failures, empty sitemaps, cookies and private responses are not stored", async () => {
    for (const application of [
      () => new Response(null, { status: 503, headers: { "cache-control": "public, max-age=3600" } }),
      () => new Response(null, { status: 404, headers: { "cache-control": "public, max-age=3600" } }),
      () => new Response("<urlset/>", { headers: { "cache-control": "public, max-age=3600", "set-cookie": "a=b" } }),
      () => new Response("<urlset/>", { headers: { "cache-control": "private, max-age=3600" } }),
      () => new Response("<urlset/>", { headers: { "cache-control": "public, max-age=0" } }),
    ]) {
      const { edgeCache, fetch, fetchWebWorker } = cachingHarness(application);
      await fetch(visit(sitemap));
      await fetch(visit(sitemap));
      expect((edgeCache as ReturnType<typeof memoryCache>).stored.size).toBe(0);
      expect(fetchWebWorker).toHaveBeenCalledTimes(2);
    }
  });

  test("other paths, queries and HEAD always reach the application", async () => {
    const { edgeCache, fetch, fetchWebWorker } = cachingHarness(publicSitemap);
    for (const request of [visit("/sitemap.xml"), visit(`${sitemap}?fresh=1`), visit(sitemap, {}, { method: "HEAD" })]) {
      await fetch(request);
    }
    expect((edgeCache as ReturnType<typeof memoryCache>).stored.size).toBe(0);
    expect(fetchWebWorker).toHaveBeenCalledTimes(3);
  });

  test("a broken cache leaves the read to the application and logs each failure", async () => {
    const { fetch, fetchWebWorker, log } = cachingHarness(publicSitemap, {
      match: () => Promise.reject(new Error("down")), put: () => Promise.reject(new Error("down")),
    });
    expect((await fetch(visit(sitemap))).body).toBe("<urlset/>");
    expect(fetchWebWorker).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.map(([event]) => event.edgeCache).filter(Boolean)).toEqual(["read-failed", "write-failed"]);
    expect(log.mock.calls.every(([event]) => event.outcome === "success")).toBe(true);
  });
});
