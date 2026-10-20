import { editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "@tudomacae/public-image-delivery/probeAuthorization";
import { createPublicImagePurger } from "@tudomacae/public-image-delivery/purge";
import { publicImageCacheGeneration, publicImageCacheTag } from "@tudomacae/public-image-delivery/cacheTag";
import { expect, test } from "vitest";
import {
  boundOriginRequests,
  editorialRequestIds,
  flagRequests,
  retiredImageSuffixes,
  runtime,
} from "./runtimeFixture";

export function registerEditorialCases(): void {
  test("editorial variants remain denied after the last use is revoked in the Cloudflare runtime", async () => {
    const key = `editorial/shared/${"a".repeat(64)}`;
    const url = `https://images.tudomacae.com.br/v1/editorial/hero/750/${encodeURIComponent(key)}`;
    const cookie = `ph_public-runtime-token_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "runtime-visitor" }))}`;
    for (const format of ["avif", "webp", "jpeg"]) {
      const headers = { cookie, accept: `image/${format}`, authorization: "Bearer preview" };
      for (const cache of ["miss", "hit"]) {
        const before = editorialRequestIds.length;
        const response = await runtime.dispatchFetch(url, { headers });
        expect(response.headers.get("x-image-result")).toBe("transformed");
        expect(response.headers.get("x-image-cache")).toBe(cache);
        expect(response.headers.has("cdn-cache-control")).toBe(false);
        expect(response.headers.has("cloudflare-cdn-cache-control")).toBe(false);
        if (cache === "hit") expect(editorialRequestIds.slice(before)).toHaveLength(0);
        else {
          expect(editorialRequestIds.slice(before)).not.toHaveLength(0);
          expect(new Set(editorialRequestIds.slice(before))).toEqual(new Set([response.headers.get("x-request-id")]));
        }
      }
    }

    const caches = await runtime.getCaches();
    const cache = caches.default;
    const cacheKeys = ["avif", "webp", "jpeg"].map((format) => {
      const cachedUrl = new URL(url);
      cachedUrl.searchParams.set("generation", publicImageCacheGeneration);
      cachedUrl.searchParams.set("format", format);
      return cachedUrl.href;
    });
    const tag = await publicImageCacheTag(key);
    for (const cacheKey of cacheKeys) expect((await cache.match(cacheKey))?.headers.get("cache-tag")).toBe(tag);
    const targets: string[] = [];
    const deleted: boolean[] = [];
    let adapterFailure: unknown;
    const purger = createPublicImagePurger({
      editorialOrigin: "https://www.tudomacae.com.br",
      wait: async () => {},
      adapter: {
        isConfigured: () => true,
        async purge(target) {
          try {
            targets.push(target.layer);
            if (target.layer === "worker") {
              expect(target.tags).toEqual([tag]);
              for (const cacheKey of cacheKeys) {
                const response = await cache.match(cacheKey);
                if (response && target.tags.includes(response.headers.get("cache-tag")!)) deleted.push(await cache.delete(cacheKey));
              }
            }
            else expect(target.files).toEqual([`https://www.tudomacae.com.br/api/imagens/${key}?cache_generation=${publicImageCacheGeneration}`]);
            return { success: true, cause: "provider", retryable: false };
          }
          catch (error) {
            adapterFailure = error;
            throw error;
          }
        },
      },
    });
    retiredImageSuffixes.add("a".repeat(64));
    const probeOriginCount = editorialRequestIds.length;
    const probeFlagCount = flagRequests;
    const probeHeaders = { "accept": "image/avif", "x-editorial-cache-probe": "1", "x-request-id": "cleanup-runtime-probe" };
    const present = await runtime.dispatchFetch(url, { method: "HEAD", headers: probeHeaders });
    expect(present.status).toBe(200);
    expect(present.headers.get("x-editorial-cache-probe")).toBe("1");
    expect(present.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(await present.text()).toBe("");
    const unsigned = await runtime.dispatchFetch(url, { method: "HEAD", headers: { "x-editorial-cache-probe": "all" } });
    expect(unsigned.status).toBe(403);
    expect(unsigned.headers.get("x-editorial-cache-probe")).toBeNull();
    const completeHeaders = { "x-editorial-cache-probe": "all", [editorialCacheProbeAuthorizationHeader]:
      await signEditorialCacheProbe(new Request(url.replace("/750/", "/3840/"), { method: "HEAD", headers: { "x-editorial-cache-probe": "all" } }), "runtime-probe-secret") };
    const completePresent = await runtime.dispatchFetch(url.replace("/750/", "/3840/"), { method: "HEAD", headers: completeHeaders });
    expect(completePresent.status).toBe(200);
    expect(completePresent.headers.get("x-editorial-cache-probe")).toBe("all");
    expect(completePresent.headers.get("x-editorial-cache-variant")).toMatch(/^750\/(avif|webp|jpeg)$/);
    expect(await completePresent.text()).toBe("");
    const purged = await purger.purge(key);
    expect(adapterFailure).toBeUndefined();
    expect(purged.success).toBe(true);
    expect(deleted).toEqual([true, true, true]);
    expect(targets).toEqual(["worker", "resizing"]);
    for (const cacheKey of cacheKeys) expect(await cache.match(cacheKey)).toBeUndefined();
    const absent = await runtime.dispatchFetch(url, { method: "HEAD", headers: probeHeaders });
    expect(absent.status).toBe(404);
    expect(absent.headers.get("x-editorial-cache-probe")).toBe("1");
    expect(absent.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(await absent.text()).toBe("");
    const completeAbsent = await runtime.dispatchFetch(url.replace("/750/", "/3840/"), { method: "HEAD", headers: completeHeaders });
    expect(completeAbsent.status).toBe(404);
    expect(completeAbsent.headers.get("x-editorial-cache-probe")).toBe("all");
    expect(await completeAbsent.text()).toBe("");
    expect(editorialRequestIds).toHaveLength(probeOriginCount);
    expect(flagRequests).toBe(probeFlagCount);
    const unsafe = await runtime.dispatchFetch(url, { method: "HEAD", headers: { ...probeHeaders, "x-request-id": "https://unsafe.example/private" } });
    expect(unsafe.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    const arbitrary = await runtime.dispatchFetch(url, { method: "HEAD", headers: { ...probeHeaders, "x-request-id": "PRIVATE_TOKEN_123456789" } });
    expect(arbitrary.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    for (const format of ["avif", "webp", "jpeg"]) {
      const response = await runtime.dispatchFetch(url, { headers: { cookie, accept: `image/${format}` } });
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-image-cache")).toBe("miss");
      expect(await response.text()).not.toContain("image/png");
    }
  });

  test("anonymous editorial delivery shares transformed cache without remote flag or warm origin reads", async () => {
    const key = `editorial/anonymous/${"b".repeat(64)}`;
    const url = `https://images.tudomacae.com.br/v1/editorial/hero/750/${encodeURIComponent(key)}`;
    const before = boundOriginRequests;
    const cold = await runtime.dispatchFetch(url);
    expect(cold.status).toBe(200);
    expect(cold.headers.get("x-image-result")).toBe("transformed");
    expect(cold.headers.get("x-image-cache")).toBe("miss");
    expect(cold.headers.get("vary")).toBe("Accept");
    expect(cold.headers.get("cache-control")).toBe("private, no-store");
    expect((await cold.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(boundOriginRequests).toBe(before + 2);
    const warm = await runtime.dispatchFetch(url, {
      headers: { cookie: "unrelated=visitor", authorization: "Bearer preview" },
    });
    expect(warm.status).toBe(200);
    expect(warm.headers.get("x-image-result")).toBe("transformed");
    expect(warm.headers.get("x-image-cache")).toBe("hit");
    expect((await warm.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(boundOriginRequests).toBe(before + 2);
    expect(flagRequests).toBe(0);
  });

  test("anonymous editorial transformation failure falls back through the authorized service binding", async () => {
    const key = `editorial/fallback/${"c".repeat(64)}`;
    const before = boundOriginRequests;
    const response = await runtime.dispatchFetch(
      `https://images.tudomacae.com.br/v1/editorial/hero/750/${encodeURIComponent(key)}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-image-result")).toBe("fallback");
    expect(await response.text()).toBe("bound original");
    expect(boundOriginRequests).toBe(before + 2);
    expect(flagRequests).toBe(0);
  });
}
