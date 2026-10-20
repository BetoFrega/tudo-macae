import { beforeEach, describe, expect, test } from "vitest";
import { createPublicImageWorker, type PublicImageLogEvent } from "../worker";
import { configuration as classifiedsConfiguration, createFetchOrigin, memoryCache, validRequest, type FetchOrigin } from "./workerFixture";

// Only editorial images are transformed by the Worker, so only they fall back to their original.
const configuration = { ...classifiedsConfiguration, editorialOrigin: "https://www.tudomacae.com.br" };
const editorialRequest = () => validRequest(`/v1/editorial/hero/750/${encodeURIComponent(`editorial/photo/${"a".repeat(64)}`)}`);

describe("editorial public image Worker", () => {
  let fetchOrigin: FetchOrigin;
  let logs: PublicImageLogEvent[];

  beforeEach(() => {
    fetchOrigin = createFetchOrigin();
    logs = [];
  });

  test("falls back to the public original after a transformation error", async () => {
    fetchOrigin
      .mockResolvedValueOnce(new Response("failed", {
        status: 502,
        headers: { "cf-resized": "err=9523" },
      }))
      .mockResolvedValueOnce(new Response("original", {
        status: 200,
        headers: { "content-type": "image/png" },
      }));
    const worker = createPublicImageWorker({
      transform: async (input, options) => ({ response: await fetchOrigin(input, options), failure: "transformation" }),
      fetchOriginal: input => fetchOrigin(input),
      checkOrigin: async () => new Response(null, { status: 200 }),
      cache: memoryCache(),
      log: event => logs.push(event),
    });

    const response = await worker.fetch(editorialRequest(), configuration);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-image-result")).toBe("fallback");
    expect(fetchOrigin).toHaveBeenNthCalledWith(2, `https://www.tudomacae.com.br/api/imagens/editorial/photo/${"a".repeat(64)}`);
    expect(logs).toContainEqual(expect.objectContaining({
      failure: "transformation",
      result: "fallback",
    }));
  });

  test("falls back when the transformation fetch throws", async () => {
    fetchOrigin
      .mockRejectedValueOnce(new Error("transformation unavailable"))
      .mockResolvedValueOnce(new Response("original", {
        status: 200,
        headers: { "content-type": "image/png" },
      }));
    const worker = createPublicImageWorker({
      transform: async (input, options) => ({ response: await fetchOrigin(input, options), failure: "transformation" }),
      fetchOriginal: input => fetchOrigin(input),
      checkOrigin: async () => new Response(null, { status: 200 }),
      cache: memoryCache(),
      log: event => logs.push(event),
    });

    const response = await worker.fetch(editorialRequest(), configuration);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-image-result")).toBe("fallback");
    expect(logs).toContainEqual(expect.objectContaining({
      failure: "transformation",
      result: "fallback",
    }));
  });

  test("returns a short-lived gateway error when the original is unavailable", async () => {
    fetchOrigin
      .mockRejectedValueOnce(new Error("transformation unavailable"))
      .mockRejectedValueOnce(new Error("origin unavailable"));
    const worker = createPublicImageWorker({
      transform: async (input, options) => ({ response: await fetchOrigin(input, options), failure: "transformation" }),
      fetchOriginal: input => fetchOrigin(input),
      checkOrigin: async () => new Response(null, { status: 200 }),
      cache: memoryCache(),
      log: event => logs.push(event),
    });

    const response = await worker.fetch(editorialRequest(), configuration);

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logs).toContainEqual(expect.objectContaining({
      failure: "origin",
      result: "rejected",
      status: 502,
    }));
  });

  test("does not make failed originals immutable in browser caches", async () => {
    fetchOrigin
      .mockResolvedValueOnce(new Response("transform failed", { status: 502 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const worker = createPublicImageWorker({
      transform: async (input, options) => ({ response: await fetchOrigin(input, options), failure: "transformation" }),
      fetchOriginal: input => fetchOrigin(input),
      checkOrigin: async () => new Response(null, { status: 200 }),
      cache: memoryCache(),
      log: event => logs.push(event),
    });

    const response = await worker.fetch(editorialRequest(), configuration);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
