import { expect, test, vi } from "vitest";
import { createCloudflareImagePurge } from "../cloudflarePurge";
import { createPublicImagePurger } from "../purge";

const classifiedsOrigin = "https://api.tudomacae.com.br";
const tag = "public-image-59b1c5fe825df94807545c03781e67cce083081d42a6cf25e7640266d360e201";
const workerSource = "https://api.tudomacae.com.br/api/classifieds/photos/public/ad-images%2Fad-1%2Fphoto.webp?cache_generation=2";

test("invalidates both cache identities through a controlled adapter and bounds retries", async () => {
  const purge = vi.fn().mockResolvedValue({ success: false, cause: "rate_limit", retryable: true });
  const wait = vi.fn(async () => {});
  const images = createPublicImagePurger({ adapter: { isConfigured: () => true, purge }, classifiedsOrigin, wait });
  expect(await images.purgeMany(["ad-images/ad-1/photo.webp", "ad-images/ad-1/photo.webp"])).toEqual({
    success: false, attempts: 6, failures: [
      { tags: [tag], layer: "worker", cause: "rate_limit" },
      { tags: [tag], layer: "resizing", cause: "rate_limit", files: [workerSource] },
    ],
  });
  expect(purge).toHaveBeenCalledTimes(6);
  expect(wait.mock.calls).toEqual([[100], [200], [100], [200]]);
});

test("rejects invalid keys before contacting the purge adapter", async () => {
  const purge = vi.fn();
  const images = createPublicImagePurger({ adapter: { isConfigured: () => true, purge }, classifiedsOrigin, wait: async () => {} });
  await expect(images.purge("editorial/private.jpg")).rejects.toThrow("Invalid public image key");
  expect(purge).not.toHaveBeenCalled();
});

test.each([
  ["no Classifieds origin", undefined],
  ["an unsafe Classifieds origin", "http://api.tudomacae.com.br"],
])("Ad and Profile keys fail as configuration with %s, before contacting the adapter", async (_case, origin) => {
  const purge = vi.fn();
  const images = createPublicImagePurger({ adapter: { isConfigured: () => true, purge },
    ...(origin ? { classifiedsOrigin: origin } : {}), editorialOrigin: "https://www.tudomacae.com.br", wait: async () => {} });
  expect(await images.purgeMany(["profile-photos/profile-1/photo.webp"])).toMatchObject({ success: false, attempts: 0,
    failures: [{ layer: "worker", cause: "configuration" }, { layer: "resizing", cause: "configuration" }] });
  expect(purge).not.toHaveBeenCalled();
});

test("each key targets only its own delivery source within provider batches", async () => {
  const targets: { layer: string; tags: string[]; files: string[] }[] = [];
  const images = createPublicImagePurger({ adapter: { isConfigured: () => true, purge: async (target) => {
    targets.push(target);
    return { success: true, cause: "provider", retryable: false };
  } }, classifiedsOrigin, editorialOrigin: "https://www.tudomacae.com.br", wait: async () => {} });
  const editorial = `editorial/photo/${"a".repeat(64)}`;
  const keys = [editorial, ...Array.from({ length: 100 }, (_, id) => `ad-images/ad-${id}/photo.webp`)];
  const result = await images.purgeMany(keys);
  expect(result.success).toBe(true);
  expect(targets.map(target => [target.layer, target.tags.length, target.files.length])).toEqual([
    ["worker", 100, 100], ["resizing", 100, 100], ["worker", 1, 1], ["resizing", 1, 1],
  ]);
  const files = targets.filter(target => target.layer === "resizing").flatMap(target => target.files);
  expect(files[0]).toBe(`https://www.tudomacae.com.br/api/imagens/${editorial}?cache_generation=2`);
  expect(files.slice(1).every(file => file.startsWith(`${classifiedsOrigin}/api/classifieds/photos/public/ad-images%2F`))).toBe(true);
  expect(files.slice(1).every(file => new URL(file).searchParams.get("cache_generation") === "2")).toBe(true);
});

test("Cloudflare purge calls the injected fetch without a receiver (workerd rejects the global fetch as a method)", async () => {
  function strict(this: unknown): Promise<Response> {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(Response.json({ success: true }));
  }
  const adapter = createCloudflareImagePurge({ fetchPurge: strict as typeof fetch, token: "token", zoneId: "a".repeat(32) });
  expect(await adapter.purge({ layer: "worker", tags: [tag], files: [] }, new AbortController().signal)).toMatchObject({ success: true });
});
