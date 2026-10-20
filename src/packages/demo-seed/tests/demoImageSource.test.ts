import { describe, expect, test, vi } from "vitest";
import {
  createDemoImageSource,
  type CuratedImageSource,
} from "../image-source";

const SOURCE: CuratedImageSource = {
  key: "fixture",
  url: "https://example.test/fixture.jpg",
  sha1: "f95927fa25f2761a616d68319a377c5e36a921f8",
  mimeType: "image/jpeg",
  author: "Fixture author",
  license: "CC0",
  origin: "https://example.test/fixture",
};

describe("createDemoImageSource", () => {
  test("retries one failed download and returns the verified bytes", async () => {
    const fetchImage = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(new Response("fixture-image", {
        headers: { "Content-Type": "image/jpeg" },
      }));
    const source = createDemoImageSource({
      fetchImage,
      minimumIntervalMs: 0,
      timeoutMs: 50,
      retryDelayMs: 0,
    });

    const downloaded = await source.download(SOURCE);

    expect(Buffer.from(downloaded.bytes)).toEqual(Buffer.from("fixture-image"));
    expect(downloaded.mimeType).toBe("image/jpeg");
    expect(fetchImage).toHaveBeenCalledTimes(2);
    expect(fetchImage).toHaveBeenCalledWith(
      SOURCE.url,
      expect.objectContaining({
        headers: {
          "User-Agent": "Tudo-Macae-demo-seed/1.0 (https://github.com/BetoFrega/tudo-macae)",
        },
      }),
    );
  });

  test.each([
    ["7", 1_000, 7_000],
    ["Thu, 01 Jan 1970 00:00:06 GMT", 1_000, 5_000],
  ])(
    "respects Retry-After %s before retrying a rate-limited download",
    async (retryAfter, now, expectedDelay) => {
      const fetchImage = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, {
          status: 429,
          headers: { "Retry-After": retryAfter },
        }))
        .mockResolvedValueOnce(new Response("fixture-image"));
      const sleep = vi.fn(async (_delayMs: number) => {});
      const source = createDemoImageSource({
        fetchImage,
        minimumIntervalMs: 0,
        now: () => now,
        retryDelayMs: 0,
        sleep,
      });

      await expect(source.download(SOURCE)).resolves.toMatchObject({
        mimeType: "image/jpeg",
      });
      expect(sleep).toHaveBeenCalledWith(expectedDelay);
    },
  );

  test("waits five seconds before retrying a rate limit without usable guidance", async () => {
    const fetchImage = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 429,
        headers: { "Retry-After": "later" },
      }))
      .mockResolvedValueOnce(new Response("fixture-image"));
    const sleep = vi.fn(async (_delayMs: number) => {});
    const source = createDemoImageSource({
      fetchImage,
      minimumIntervalMs: 0,
      retryDelayMs: 0,
      sleep,
    });

    await source.download(SOURCE);

    expect(sleep).toHaveBeenCalledWith(5_000);
  });

  test("times out both attempts instead of hanging the image job", async () => {
    const fetchImage = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      }));
    const source = createDemoImageSource({
      fetchImage,
      minimumIntervalMs: 0,
      timeoutMs: 5,
      retryDelayMs: 0,
    });

    await expect(source.download(SOURCE)).rejects.toBeInstanceOf(Error);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  test("rejects changed bytes instead of silently changing a stable image", async () => {
    const fetchImage = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response("different-image"));
    const source = createDemoImageSource({
      fetchImage,
      minimumIntervalMs: 0,
      retryDelayMs: 0,
    });

    await expect(source.download(SOURCE)).rejects.toThrow(
      "failed integrity verification",
    );
    expect(fetchImage).toHaveBeenCalledOnce();
  });
});
