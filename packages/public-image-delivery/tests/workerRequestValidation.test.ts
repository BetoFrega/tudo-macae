import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPublicImageWorker, type PublicImageLogEvent } from "../worker";
import { configuration, createFetchOrigin, memoryCache, validRequest, type FetchOrigin } from "./workerFixture";

describe("public image Worker", () => {
  let fetchOrigin: FetchOrigin;
  let logs: PublicImageLogEvent[];

  beforeEach(() => {
    fetchOrigin = createFetchOrigin();
    logs = [];
  });

  test.each([
    ["host", new Request("https://attacker.example/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp")],
    ["port", new Request("https://images.tudomacae.com.br:8443/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp")],
    ["query", validRequest("/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp?width=999")],
    ["preset", validRequest("/v1/ad/freeform/750/ad-images%2Fad-1%2Fphoto.webp")],
    ["width", validRequest("/v1/ad/card/777/ad-images%2Fad-1%2Fphoto.webp")],
    ["private prefix", validRequest("/v1/ad/card/750/editorial%2Fprivate.webp")],
    ["traversal", validRequest("/v1/ad/card/750/ad-images%2F..%2Fprivate.webp")],
    ["double encoding", validRequest("/v1/ad/card/750/ad-images%252Fad-1%252Fphoto.webp")],
  ])("rejects manipulated %s input", async (_case, request) => {
    const checkOrigin = vi.fn(async () => new Response(null, { status: 200 }));
    const worker = createPublicImageWorker({
      transform: async (input, options) => ({ response: await fetchOrigin(input, options), failure: "transformation" }),
      fetchOriginal: input => fetchOrigin(input),
      checkOrigin,
      cache: memoryCache(),
      log: event => logs.push(event),
    });

    expect((await worker.fetch(request, configuration)).status).toBe(400);
    expect(checkOrigin).not.toHaveBeenCalled();
    expect(fetchOrigin).not.toHaveBeenCalled();
  });
});

test.each([
  ["unknown class", validRequest("/v1/unlisted/card/750/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["unknown preset", validRequest("/v1/ad/unlisted/750/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["unsupported width", validRequest("/v1/ad/card/777/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["malformed width", validRequest("/v1/ad/card/wide/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["wrong key prefix with path segments", validRequest("/v1/ad/card/750/profile-photos/private-id/request-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["invalid key traversal", validRequest("/v1/ad/card/750/ad-images%2F..%2Fprivate-id.webp"), "/v1/:class/:preset/:width/:key"],
  ["invalid remaining class", validRequest("/v1/remaining/ad/card/750/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/remaining/:class/:preset/:width/:key"],
  ["invalid remaining preset", validRequest("/v1/remaining/profile/card/64/profile-photos%2Fprivate-id%2Frequest-key.webp"), "/v1/remaining/:class/:preset/:width/:key"],
  ["unsupported method", new Request("https://images.tudomacae.com.br/v1/ad/card/750/ad-images%2Fprivate-id%2Frequest-key.webp", { method: "POST" }), "/v1/:class/:preset/:width/:key"],
  ["external host", new Request("https://attacker.example/v1/ad/card/750/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["wrong protocol", new Request("http://images.tudomacae.com.br/v1/ad/card/750/ad-images%2Fprivate-id%2Frequest-key.webp"), "/v1/:class/:preset/:width/:key"],
  ["query string", validRequest("/v1/ad/card/750/ad-images%2Fprivate-id%2Frequest-key.webp?signature=private-query-value"), "/v1/:class/:preset/:width/:key"],
] as const)("logs one bounded 400 event for structurally recognized %s", async (_case, request, routeTemplate) => {
  const cache = memoryCache();
  const cacheMatch = vi.spyOn(cache, "match");
  const transform = vi.fn(async () => ({ response: new Response("secret-image"), failure: "transformation" as const }));
  const fetchOriginal = vi.fn(async () => new Response("secret-original"));
  const checkOrigin = vi.fn(async () => new Response(null, { status: 200 }));
  const events: PublicImageLogEvent[] = [];
  const worker = createPublicImageWorker({ cache, transform, fetchOriginal, checkOrigin, log: event => events.push(event) });

  const response = await worker.fetch(new Request(request, { headers: {
    "authorization": "private-authorization",
    "cookie": "private-cookie",
    "x-editorial-cache-probe": "private-probe-value",
  } }), configuration);

  expect(response.status).toBe(400);
  expect(events).toEqual([{
    cache: "uninspected",
    reason: "invalid_public_image_request",
    result: "rejected",
    routeTemplate,
    status: 400,
  }]);
  expect(JSON.stringify(events)).not.toMatch(/private-id|request-key|signature|private-query-value|private-authorization|private-cookie|private-probe-value|secret-image|secret-original|https?:/);
  expect(cacheMatch).not.toHaveBeenCalled();
  expect(checkOrigin).not.toHaveBeenCalled();
  expect(fetchOriginal).not.toHaveBeenCalled();
  expect(transform).not.toHaveBeenCalled();
});

test("does not label paths outside the public image request grammar", async () => {
  const events: PublicImageLogEvent[] = [];
  const worker = createPublicImageWorker({
    cache: memoryCache(),
    transform: async () => ({ response: new Response(null), failure: "transformation" }),
    fetchOriginal: async () => new Response(null),
    checkOrigin: async () => new Response(null),
    log: event => events.push(event),
  });

  expect((await worker.fetch(validRequest("/v1/ad/card/750"), configuration)).status).toBe(400);
  expect((await worker.fetch(validRequest("/v1/ad/card/750/"), configuration)).status).toBe(400);
  expect(events).toEqual([]);
});
