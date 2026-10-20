import { createPublicImagePurger } from "@tudomacae/public-image-delivery/purge";
import { publicImageCacheGeneration, publicImageCacheTag } from "@tudomacae/public-image-delivery/cacheTag";
import { expect, test, vi } from "vitest";
import {
  flagRequests,
  retiredImageSuffixes,
  runtime,
  runtimeClassifiedsOrigin,
  runtimeLogs,
} from "./runtimeFixture";

export function registerProfileCases(): void {
  test("profile purge removes the cache shared by historical and definitive URLs", async () => {
    const key = "profile-photos/profile-runtime/alias-purge.webp";
    const definitive = `https://images.tudomacae.com.br/v1/profile/avatar/128/${encodeURIComponent(key)}`;
    const alias = definitive.replace("/v1/", "/v1/remaining/");
    const keys = [];
    for (const format of ["avif", "webp", "jpeg"]) {
      expect((await runtime.dispatchFetch(alias, { headers: { accept: `image/${format}` } })).status).toBe(200);
      expect((await runtime.dispatchFetch(definitive, { headers: { accept: `image/${format}` } })).headers.get("x-image-cache")).toBe("hit");
      const cached = new URL(definitive);
      cached.searchParams.set("generation", publicImageCacheGeneration);
      cached.searchParams.set("format", format);
      keys.push(cached.href);
    }
    const cache = (await runtime.getCaches()).default;
    const tag = await publicImageCacheTag(key);
    const layers: string[] = [];
    const purger = createPublicImagePurger({ classifiedsOrigin: runtimeClassifiedsOrigin, wait: async () => {},
      adapter: { isConfigured: () => true, async purge(target) {
        layers.push(target.layer);
        if (target.layer === "worker") {
          expect(target.tags).toEqual([tag]);
          for (const path of keys) {
            expect((await cache.match(path))?.headers.get("cache-tag")).toBe(tag);
            expect(await cache.delete(path)).toBe(true);
          }
        }
        else expect(target.files).toEqual([`${runtimeClassifiedsOrigin}/api/classifieds/photos/public/${encodeURIComponent(key)}?cache_generation=${publicImageCacheGeneration}`]);
        return { success: true, cause: "provider", retryable: false };
      } } });
    expect((await purger.purge(key)).success).toBe(true);
    expect(layers).toEqual(["worker", "resizing"]);
    for (const path of keys) expect(await cache.match(path)).toBeUndefined();
    expect((await runtime.dispatchFetch(alias, { headers: { accept: "image/avif" } })).headers.get("x-image-cache")).toBe("miss");
    expect((await runtime.dispatchFetch(definitive, { headers: { accept: "image/avif" } })).headers.get("x-image-cache")).toBe("hit");
  });

  test("anonymous historical avatars share definitive public cache and correlate an uncached retirement", async () => {
    const key = "profile-photos/profile-runtime/photo.webp";
    const url = `https://images.tudomacae.com.br/v1/remaining/profile/avatar/128/${encodeURIComponent(key)}`;
    const definitive = url.replace("/remaining/", "/");
    for (const method of ["GET", "HEAD"]) {
      const response = await runtime.dispatchFetch(url, { method });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-image-result")).toBe("transformed");
      expect(response.headers.get("cache-control")).toBe("public, max-age=30");
      expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
      expect(response.headers.get("location")).toBeNull();
      const bytes = (await response.arrayBuffer()).byteLength;
      if (method === "HEAD") expect(bytes).toBe(0);
      else expect(bytes).toBeGreaterThan(0);
      const adopted = await runtime.dispatchFetch(definitive, { method });
      expect(adopted.headers.get("x-image-cache")).toBe("hit");
      expect(adopted.headers.get("cache-control")).toBe("public, max-age=30");
    }
    expect(flagRequests).toBe(0);
    retiredImageSuffixes.add("photo.webp");
    // Cached variants leave only through the verified purge; an uncached width reads the origin's retirement.
    const uncached = url.replace("/avatar/128/", "/avatar/96/");
    for (const target of [uncached, uncached.replace("/remaining/", "/")]) for (const method of ["GET", "HEAD"]) {
      const denied = await runtime.dispatchFetch(target, { method });
      expect(denied.status).toBe(410);
      expect(denied.headers.get("cache-control")).toBe("no-store");
      if (method === "HEAD") expect(await denied.text()).toBe("");
      const event = await vi.waitFor(() => {
        const found = runtimeLogs.find(value => value.includes(`requestId: '${denied.headers.get("x-request-id")}'`));
        expect(found).toBeDefined();
        return found;
      });
      expect(event).toContain("event: 'public-image-delivery'");
      expect(event).toContain("service: 'public-images'");
      expect(event).toContain("environment: 'qualification'");
      expect(event).toContain("outcome: 'denied'");
      expect(event).toContain("status: 410");
      expect(event).toContain("statusClass: '4xx'");
      const route = target === uncached ? "/v1/remaining/profile/avatar/:width/:key" : "/v1/profile/avatar/:width/:key";
      expect(event).toContain(`route: '${route}'`);
      expect(event).not.toMatch(/runtime-visitor|cookie|posthog|https:|photo\.webp/);
    }
    expect(flagRequests).toBe(0);
  });

  test.each([
    { route: "/v1/ad/card/750/", prefix: "ad-images/ad-age" },
    { route: "/v1/profile/avatar/96/", prefix: "profile-photos/profile-age" },
    { route: "/v1/remaining/profile/avatar/96/", prefix: "profile-photos/alias-age" },
  ])
  ("refreshes inherited browser cache age for $route in the real Worker", async ({ route, prefix }) => {
    for (const method of ["GET", "HEAD"]) {
      const key = `${prefix}/aged-${method}.webp`;
      const url = `https://images.tudomacae.com.br${route}${encodeURIComponent(key)}`;
      for (const attempt of ["miss", "hit"]) {
        const before = Date.now() - 1000;
        const response = await runtime.dispatchFetch(url, { method });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("public, max-age=30");
        expect(response.headers.get("age")).toBeNull();
        const date = Date.parse(response.headers.get("date")!);
        expect(date).toBeGreaterThanOrEqual(before);
        expect(date).toBeLessThanOrEqual(Date.now());
        expect(response.headers.get("x-image-cache")).toBe(attempt);
        expect(response.headers.get("x-image-result")).toBe("transformed");
        const bytes = (await response.arrayBuffer()).byteLength;
        if (method === "HEAD") expect(bytes).toBe(0);
        else expect(bytes).toBeGreaterThan(0);
      }
    }
  });
}
