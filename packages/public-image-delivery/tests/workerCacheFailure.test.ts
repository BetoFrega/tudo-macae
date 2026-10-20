import { expect, test, vi } from "vitest";
import { createPublicImageWorker, type PublicImageLogEvent } from "../worker";
import { configuration, hostedOnly, memoryCache, validRequest } from "./workerFixture";

test("logs a bounded cache failure and returns no-store before origin access", async () => {
  const cache = memoryCache();
  vi.spyOn(cache, "match").mockRejectedValue(new Error("private cache details"));
  const checkOrigin = vi.fn(async () => new Response(null, { status: 200 }));
  const fetchOriginal = vi.fn(async () => new Response("secret-original"));
  const transform = vi.fn(async () => ({ response: new Response("secret-image"), failure: "transformation" as const }));
  const events: PublicImageLogEvent[] = [];
  const worker = createPublicImageWorker({ cache, checkOrigin, fetchOriginal, transform, log: event => events.push(event) });

  const response = await worker.fetch(validRequest(), configuration);

  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(events).toEqual([{
    cache: "uninspected",
    failure: "cache",
    imageClass: "ad",
    preset: "card",
    result: "rejected",
    status: 502,
  }]);
  expect(JSON.stringify(events)).not.toContain("private cache details");
  expect(checkOrigin).not.toHaveBeenCalled();
  expect(fetchOriginal).not.toHaveBeenCalled();
  expect(transform).not.toHaveBeenCalled();
});

test("logs an uninspected cache failure for an editorial probe without contacting origin", async () => {
  const cache = memoryCache();
  const cacheFailure = new Error("private probe cache details");
  const cacheMatch = vi.spyOn(cache, "match").mockRejectedValue(cacheFailure);
  const checkOrigin = vi.fn(async () => new Response(null, { status: 200 }));
  const fetchOriginal = vi.fn(async () => new Response("secret-original"));
  const transform = vi.fn(async () => ({ response: new Response("secret-image"), failure: "transformation" as const }));
  const events: PublicImageLogEvent[] = [];
  const worker = createPublicImageWorker({ cache, checkOrigin, fetchOriginal, transform, log: event => events.push(event) });
  const editorialKey = `editorial/photo/${"a".repeat(64)}`;
  const request = new Request(
    `https://${configuration.publicHost}/v1/editorial/hero/750/${encodeURIComponent(editorialKey)}`,
    { method: "HEAD", headers: { "x-editorial-cache-probe": "1" } },
  );

  const response = await worker.fetch(request, { ...configuration, editorialOrigin: "https://www.tudomacae.com.br" });

  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(events).toEqual([{
    cache: "uninspected",
    failure: "cache",
    imageClass: "editorial",
    preset: "hero",
    result: "rejected",
    status: 502,
  }]);
  expect(JSON.stringify(events)).not.toContain("private probe cache details");
  expect(cacheMatch).toHaveBeenCalledTimes(1);
  expect(checkOrigin).not.toHaveBeenCalled();
  expect(fetchOriginal).not.toHaveBeenCalled();
  expect(transform).not.toHaveBeenCalled();
});

test("logs deferred cache-write failure without changing the successful response", async () => {
  const cache = memoryCache();
  vi.spyOn(cache, "put").mockRejectedValue(new Error("private cache write details"));
  const events: PublicImageLogEvent[] = [];
  const deferred: Promise<unknown>[] = [];
  const worker = createPublicImageWorker({
    cache,
    ...hostedOnly,
    fetchOriginal: async () => new Response("secret-image"),
    log: event => events.push(event),
  });

  const response = await worker.fetch(validRequest(), configuration, promise => deferred.push(promise));

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("public, max-age=30");
  expect(deferred).toHaveLength(1);
  await deferred[0];
  expect(events).toEqual([
    {
      cache: "miss",
      imageClass: "ad",
      preset: "card",
      result: "transformed",
      status: 200,
    },
    {
      cache: "miss",
      failure: "cache",
      imageClass: "ad",
      preset: "card",
      result: "cache_write_failed",
      status: 200,
    },
  ]);
  expect(JSON.stringify(events)).not.toContain("private cache write details");
  expect(await response.text()).toBe("secret-image");
});
