import { describe, expect, test, vi } from "vitest";
import { publicImageCacheTag } from "@tudomacae/public-image-delivery/cacheTag";
import { createCloudflareImagePurge } from "../cloudflarePurge";
import { createPublicImagePurger } from "@tudomacae/public-image-delivery/purge";

const key = "ad-images/ad-1/photo.webp";
const tag = "public-image-59b1c5fe825df94807545c03781e67cce083081d42a6cf25e7640266d360e201";
const zoneId = "0123456789abcdef0123456789abcdef";
const classifiedsOrigin = "https://api.tudomacae.com.br";
const sourceUrl = `${classifiedsOrigin}/api/classifieds/photos/public/ad-images%2Fad-1%2Fphoto.webp?cache_generation=2`;

function purger(fetchPurge: typeof fetch, overrides: { token?: string; attemptTimeoutMs?: number } = {}) {
  return createPublicImagePurger({
    adapter: createCloudflareImagePurge({ fetchPurge, token: overrides.token ?? "test-token", zoneId }),
    classifiedsOrigin,
    attemptTimeoutMs: overrides.attemptTimeoutMs ?? 3000,
    wait: vi.fn(async () => {}),
  });
}

function payload(fetchPurge: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
  return JSON.parse(String(fetchPurge.mock.calls[index]?.[1]?.body));
}

describe("public image purge", () => {
  test("uses one bounded tag for every variant of a photo", async () => {
    expect(await publicImageCacheTag(key)).toBe(tag);
  });

  test("purges both the Worker entry and the Classifieds source URL", async () => {
    const fetchPurge = vi.fn<typeof fetch>(async () => Response.json({ success: true }));

    expect(await purger(fetchPurge).purge(key)).toEqual({ success: true, attempts: 2, failures: [] });
    expect(fetchPurge).toHaveBeenCalledTimes(2);
    expect(payload(fetchPurge, 0)).toEqual({ tags: [tag] });
    expect(payload(fetchPurge, 1)).toEqual({ files: [sourceUrl] });
    expect(fetchPurge.mock.calls[0]?.[0])
      .toBe(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`);
  });

  test("batches an ad deletion by 100 objects in both layers", async () => {
    const fetchPurge = vi.fn<typeof fetch>(async () => Response.json({ success: true }));
    const keys = Array.from({ length: 101 }, (_, index) => `ad-images/ad-1/${index}.webp`);

    expect(await purger(fetchPurge).purgeMany([...keys, keys[0]!]))
      .toEqual({ success: true, attempts: 4, failures: [] });
    expect(fetchPurge).toHaveBeenCalledTimes(4);
    expect(payload(fetchPurge, 0).tags).toHaveLength(100);
    expect(payload(fetchPurge, 1).files).toHaveLength(100);
    expect(payload(fetchPurge, 2).tags).toHaveLength(1);
    expect(payload(fetchPurge, 3).files).toHaveLength(1);
  });

  test("records a tag failure while still purging the source URL", async () => {
    const fetchPurge = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ success: false }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ success: true }));

    expect(await purger(fetchPurge).purge(key)).toEqual({
      success: false,
      attempts: 2,
      failures: [{ tags: [tag], layer: "worker", cause: "authorization" }],
    });
    expect(payload(fetchPurge, 1)).toEqual({ files: [sourceUrl] });
  });

  test("retries transient failures independently per layer", async () => {
    const fetchPurge = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ success: false }, { status: 503 }))
      .mockImplementation(async () => Response.json({ success: true }));

    expect(await purger(fetchPurge).purge(key)).toEqual({ success: true, attempts: 3, failures: [] });
    expect(fetchPurge).toHaveBeenCalledTimes(3);
    expect(payload(fetchPurge, 0)).toEqual({ tags: [tag] });
    expect(payload(fetchPurge, 1)).toEqual({ tags: [tag] });
    expect(payload(fetchPurge, 2)).toEqual({ files: [sourceUrl] });
  });

  test("reports missing configuration without contacting Cloudflare", async () => {
    const fetchPurge = vi.fn<typeof fetch>();
    const result = await createPublicImagePurger({
      adapter: createCloudflareImagePurge({ fetchPurge, token: undefined, zoneId }),
      classifiedsOrigin,
      wait: vi.fn(async () => {}),
    }).purge(key);

    expect(result).toEqual({
      success: false,
      attempts: 0,
      failures: [
        { tags: [tag], layer: "worker", cause: "configuration" },
        { tags: [tag], layer: "resizing", cause: "configuration" },
      ],
    });
    expect(fetchPurge).not.toHaveBeenCalled();
  });

  test("bounds transport failure to three attempts per layer", async () => {
    const fetchPurge = vi.fn<typeof fetch>().mockRejectedValue(new Error("network unavailable"));

    expect(await purger(fetchPurge).purge(key)).toEqual({
      success: false,
      attempts: 6,
      failures: [
        { tags: [tag], layer: "worker", cause: "transport" },
        { tags: [tag], layer: "resizing", cause: "transport", files: [sourceUrl] },
      ],
    });
    expect(fetchPurge).toHaveBeenCalledTimes(6);
  });

  test("times out a stalled provider request and continues with the other layer", async () => {
    const fetchPurge = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
    }));

    expect(await purger(fetchPurge, { attemptTimeoutMs: 5 }).purge(key)).toEqual({
      success: false,
      attempts: 6,
      failures: [
        { tags: [tag], layer: "worker", cause: "timeout" },
        { tags: [tag], layer: "resizing", cause: "timeout", files: [sourceUrl] },
      ],
    });
    expect(fetchPurge).toHaveBeenCalledTimes(6);
  });
});
