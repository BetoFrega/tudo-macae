import { expect, test, vi } from "vitest";
import { createPublicImageWorker } from "../worker";
import { configuration, hostedOnly, memoryCache, validRequest } from "./workerFixture";
import { editorialCacheProbeHeader, editorialCacheVariantHeader } from "../contract";
import { editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "../probeAuthorization";

test.each(["GET", "HEAD"])("historical profile aliases serve public variants for anonymous %s and share the definitive cache", async (method) => {
  let removed = false;
  const fetchOriginal = vi.fn(async () => removed ? new Response(null, { status: 410 }) : new Response("hosted variant"));
  const worker = createPublicImageWorker({ cache: memoryCache(), ...hostedOnly, fetchOriginal, log() {} });
  const alias = validRequest("/v1/remaining/profile/avatar/64/profile-photos%2Fshop%2Fphoto.webp");
  const response = await worker.fetch(new Request(alias, { method }), configuration);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("public, max-age=30");
  expect(response.headers.get("x-image-result")).toBe("transformed");
  expect(response.headers.get("location")).toBeNull();
  expect(await response.text()).toBe(method === "HEAD" ? "" : "hosted variant");
  const definitive = validRequest("/v1/profile/avatar/64/profile-photos%2Fshop%2Fphoto.webp");
  expect((await worker.fetch(definitive, configuration)).headers.get("x-image-cache")).toBe("hit");
  expect((await worker.fetch(alias, configuration)).headers.get("x-image-cache")).toBe("hit");
  expect(fetchOriginal).toHaveBeenCalledOnce();
  expect(fetchOriginal.mock.calls[0]).toEqual([expect.stringMatching(/^https:\/\/api\.tudomacae\.com\.br\/api\/classifieds\/photos\/public\/profile-photos%2Fshop%2Fphoto\.webp\?w=64&/)]);
  removed = true;
  const denied = await worker.fetch(new Request(validRequest("/v1/remaining/profile/avatar/96/profile-photos%2Fshop%2Fphoto.webp"), { method }), configuration);
  expect(denied.status).toBe(410);
  expect(denied.headers.get("cache-control")).toBe("no-store");
  expect(await denied.text()).toBe(method === "HEAD" ? "" : "Public image gone");
});

test("historical aliases do not widen supported classes or expose a denied origin", async () => {
  const worker = createPublicImageWorker({
    cache: memoryCache(), ...hostedOnly,
    fetchOriginal: async () => new Response("denied bytes", { status: 404 }), log() {},
  });
  const denied = await worker.fetch(validRequest("/v1/remaining/profile/avatar/64/profile-photos%2Fshop%2Fphoto.webp"), configuration);
  expect(denied.status).toBe(404);
  expect(await denied.text()).toBe("Public image not found");
  expect((await worker.fetch(validRequest("/v1/remaining/profile/avatar/64/media-staged%2Fprivate.webp"), configuration)).status).toBe(400);
  expect((await worker.fetch(validRequest("/v1/remaining/ad/card/750/ad-images%2Fshop%2Fphoto.webp"), configuration)).status).toBe(400);
});

test("a failed Hosted alias read returns no bytes and no redirect", async () => {
  const worker = createPublicImageWorker({
    cache: memoryCache(), ...hostedOnly,
    fetchOriginal: async () => { throw new Error("origin unavailable"); }, log() {},
  });
  const response = await worker.fetch(validRequest("/v1/remaining/profile/avatar/64/profile-photos%2Fshop%2Fphoto.webp"), configuration);
  expect(response.status).toBe(502);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-image-result")).toBe("rejected");
  expect(await response.text()).toBe("Public image origin unavailable");
});

test("a qualified classifieds origin reads its variant once and serves warm hits without an origin read", async () => {
  const calls: string[] = [];
  let removed = false;
  const worker = createPublicImageWorker({ cache: memoryCache(),
    transform: async (origin) => {
      throw new Error(`Hosted delivery must not transform ${origin}`);
    },
    fetchOriginal: async (origin) => {
      calls.push(origin);
      const url = new URL(origin);
      expect(url.searchParams.get("w")).toBe("750");
      expect(url.searchParams.get("format")).toBe("jpeg");
      return removed ? new Response(null, { status: 410 }) : new Response("hosted variant");
    },
    checkOrigin: async (origin) => {
      throw new Error(`Hosted delivery must not guard ${origin}`);
    }, log: () => {} });
  expect((await worker.fetch(validRequest(), configuration)).status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatch(/^https:\/\/api\.tudomacae\.com\.br\/api\/classifieds\/photos\/public\//);
  removed = true;
  // Retirement of a cached variant belongs to the verified purge, not to a per-hit origin read.
  const hit = await worker.fetch(validRequest(), configuration);
  expect(hit.headers.get("x-image-cache")).toBe("hit");
  expect(calls).toHaveLength(1);
  expect((await worker.fetch(validRequest("/v1/ad/card/750/ad-images%2Fad-1%2Fother.webp"), configuration)).status).toBe(410);
});

test("a cold Hosted variant takes its status from its own read", async () => {
  const read: URL[] = [];
  const worker = createPublicImageWorker({ cache: memoryCache(),
    transform: async () => { throw new Error("Hosted delivery must not transform"); },
    fetchOriginal: async (origin) => {
      const url = new URL(origin);
      read.push(url);
      return url.searchParams.get("format") === "avif" ? new Response(null, { status: 404 }) : new Response("hosted variant");
    },
    checkOrigin: async () => { throw new Error("Hosted delivery must not guard"); }, log: () => {} });
  const avatar = (accept: string) => validRequest("/v1/profile/avatar/128/profile-photos%2Fshop%2Fphoto.webp", { accept });
  expect((await worker.fetch(avatar("image/webp"), configuration)).status).toBe(200);
  expect((await worker.fetch(avatar("image/avif"), configuration)).status).toBe(404);
  expect(read.map(url => `${url.searchParams.get("w")}/${url.searchParams.get("format")}`)).toEqual(["128/webp", "128/avif"]);
});

test("a complete Hosted probe finds a late fill in any preset without reading the origin", async () => {
  const origin = vi.fn(async () => new Response("hosted variant"));
  const transform = async () => {
    throw new Error("Hosted delivery must not transform");
  };
  const worker = createPublicImageWorker({ cache: memoryCache(), transform, fetchOriginal: origin, checkOrigin: origin, log: () => {} });
  const selected = { ...configuration, editorialCacheProbeSecret: "probe-secret" };
  const probe = async () => {
    const request = new Request(`https://${configuration.publicHost}/v1/ad/thumbnail/128/ad-images%2Fad-1%2Fphoto.webp`, { method: "HEAD", headers: { [editorialCacheProbeHeader]: "all" } });
    request.headers.set(editorialCacheProbeAuthorizationHeader, await signEditorialCacheProbe(request, "probe-secret"));
    return worker.fetch(request, selected);
  };
  expect((await probe()).status).toBe(404);
  expect(origin).not.toHaveBeenCalled();
  await worker.fetch(validRequest("/v1/ad/gallery/384/ad-images%2Fad-1%2Fphoto.webp", { accept: "image/webp" }), selected);
  const present = await probe();
  expect(present.status).toBe(200);
  expect(present.headers.get(editorialCacheVariantHeader)).toBe("gallery/384/webp");
  expect(origin).toHaveBeenCalledTimes(1);
});
