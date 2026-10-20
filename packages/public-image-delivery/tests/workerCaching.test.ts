import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPublicImageWorker, type PublicImageLogEvent } from "../worker";
import { configuration, createFetchOrigin, hostedOnly, memoryCache, validRequest, type FetchOrigin } from "./workerFixture";

describe("public image Worker", () => {
  let fetchOrigin: FetchOrigin;
  let logs: PublicImageLogEvent[];

  beforeEach(() => {
    fetchOrigin = createFetchOrigin();
    logs = [];
  });

  test("reads the negotiated variant from the Classifieds Worker origin and stores it under its purge tag", async () => {
    const cache = memoryCache();
    const cachePut = vi.spyOn(cache, "put");
    const worker = createPublicImageWorker({
      ...hostedOnly,
      fetchOriginal: input => fetchOrigin(input),
      cache,
      log: event => logs.push(event),
    });

    const response = await worker.fetch(
      validRequest(undefined, { accept: "image/avif,image/webp" }),
      configuration,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
    expect(response.headers.get("x-image-cache")).toBe("miss");
    expect(response.headers.get("x-image-result")).toBe("transformed");
    expect(fetchOrigin).toHaveBeenCalledExactlyOnceWith(
      "https://api.tudomacae.com.br/api/classifieds/photos/public/ad-images%2Fad-1%2Fphoto.webp?w=750&format=avif&cache_generation=2",
    );
    expect(cachePut.mock.calls[0]?.[1].headers.get("Cache-Tag"))
      .toBe("public-image-59b1c5fe825df94807545c03781e67cce083081d42a6cf25e7640266d360e201");
    expect(cachePut.mock.calls[0]?.[0].url).toContain("generation=2&format=avif");
    expect(logs).toContainEqual(expect.objectContaining({
      cache: "miss",
      imageClass: "ad",
      preset: "card",
      result: "transformed",
    }));
  });

  test.each([
    ["image/avif;q=0,image/webp,image/*;q=0.8", "webp"],
    ["image/jpeg", "jpeg"],
  ])("negotiates %s as %s", async (accept, format) => {
    const worker = createPublicImageWorker({
      ...hostedOnly,
      fetchOriginal: input => fetchOrigin(input),
      cache: memoryCache(),
      log: event => logs.push(event),
    });

    await worker.fetch(validRequest(undefined, { accept }), configuration);

    expect(new URL(fetchOrigin.mock.calls[0]![0]).searchParams.get("format")).toBe(format);
  });

  test("does not reuse an older cache entry that has no purge tag", async () => {
    const cache = memoryCache();
    const request = validRequest(undefined, { accept: "image/avif" });
    const oldKey = new URL(request.url);
    oldKey.searchParams.set("format", "avif");
    await cache.put(new Request(oldKey), new Response("old untagged image", {
      headers: { "content-type": "image/avif" },
    }));
    const worker = createPublicImageWorker({
      ...hostedOnly,
      fetchOriginal: input => fetchOrigin(input),
      cache,
      log: event => logs.push(event),
    });

    const first = await worker.fetch(request, configuration);
    const second = await worker.fetch(request, configuration);

    expect(first.headers.get("x-image-cache")).toBe("miss");
    expect(second.headers.get("x-image-cache")).toBe("hit");
    expect(await first.text()).toBe("transformed");
    expect(fetchOrigin).toHaveBeenCalledOnce();
  });
});
