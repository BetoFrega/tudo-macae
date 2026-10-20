import { expect, test, vi } from "vitest";
import { createPublicImageWorker, type PublicImageCache } from "../worker";
import { configuration, hostedOnly, validRequest } from "./workerFixture";

test.each([
  "/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp",
  "/v1/profile/avatar/96/profile-photos%2Fprofile-1%2Fphoto.webp",
  "/v1/remaining/profile/avatar/96/profile-photos%2Fprofile-1%2Fphoto.webp",
].flatMap(path => ["GET", "HEAD"].flatMap(method => ["fetched", "cached"].map(mode => ({ path, method, mode })))))
("starts fresh public browser caching for $mode $method $path", async ({ path, method, mode }) => {
  const age = "104636";
  const oldDate = new Date(Date.now() - Number(age) * 1000).toUTCString();
  const upstream = new Response("pixels", { headers: {
    "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable",
    age, "date": oldDate,
  } });
  const put = vi.fn<PublicImageCache["put"]>(async () => {});
  const fetchOriginal = vi.fn(async () => upstream.clone());
  const worker = createPublicImageWorker({
    cache: { match: async () => mode === "cached" ? upstream.clone() : undefined, put },
    ...hostedOnly, fetchOriginal, log() {},
  });
  const before = Date.now() - 1000;
  const response = await worker.fetch(new Request(validRequest(path), { method }), configuration);
  expect(response.headers.get("cache-control")).toBe("public, max-age=30");
  expect(response.headers.get("age")).toBeNull();
  const deliveredDate = Date.parse(response.headers.get("date")!);
  expect(deliveredDate).toBeGreaterThanOrEqual(before);
  expect(deliveredDate).toBeLessThanOrEqual(Date.now());
  expect(response.headers.get("x-image-cache")).toBe(mode === "cached" ? "hit" : "miss");
  expect(response.headers.get("x-image-result")).toBe("transformed");
  expect(await response.text()).toBe(method === "HEAD" ? "" : "pixels");
  expect(fetchOriginal).toHaveBeenCalledTimes(mode === "cached" ? 0 : 1);
  expect(upstream.headers.get("age")).toBe(age);
  expect(upstream.headers.get("date")).toBe(oldDate);
  if (mode === "fetched") {
    const entry = put.mock.calls[0]?.[1];
    expect(entry?.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(entry?.headers.get("age")).toBe(age);
    expect(entry?.headers.get("date")).toBe(oldDate);
  }
  else expect(put).not.toHaveBeenCalled();
});
