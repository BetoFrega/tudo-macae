import { expect, test, vi } from "vitest";
import {
  cacheWriteSettled,
  flagRequests,
  originRequests,
  retiredImageSuffixes,
  runtime,
  runtimeLogs,
} from "./runtimeFixture";

export function registerDeliveryCases(): void {
  test("separates negotiated formats and reuses each warm runtime cache entry", async () => {
    const url = "https://images.tudomacae.com.br/v1/ad/card/750/ad-images%2Fad-1%2Fruntime.webp";
    const cold = await runtime.dispatchFetch(url, {
      headers: { accept: "image/avif,image/webp" },
    });
    expect(cold.status).toBe(200);
    expect(cold.headers.get("x-image-cache")).toBe("miss");
    await cacheWriteSettled(runtime, url, "image/avif,image/webp");

    const warm = await runtime.dispatchFetch(url, {
      headers: { accept: "image/avif,image/webp" },
    });
    expect(warm.status).toBe(200);
    expect(warm.headers.get("x-image-cache")).toBe("hit");

    const webp = await runtime.dispatchFetch(url, {
      headers: { accept: "image/webp" },
    });
    expect(webp.status).toBe(200);
    expect(webp.headers.get("x-image-cache")).toBe("miss");

    const jpeg = await runtime.dispatchFetch(url, {
      headers: { accept: "image/avif;q=0,image/jpeg" },
    });
    expect(jpeg.status).toBe(200);
    expect(jpeg.headers.get("x-image-cache")).toBe("miss");
    expect(flagRequests).toBe(0);
    expect(originRequests).toBe(3);
  });

  test.each([
    {
      route: "/v1/ad/card/750/ad-images%2Fad-1%2Frequest-context.webp",
      normalizedRoute: "/v1/ad/card/:width/:key",
      imageClass: "ad",
      preset: "card",
    },
    {
      route: "/v1/profile/avatar/128/profile-photos%2Fprofile-runtime%2Frequest-context.webp",
      normalizedRoute: "/v1/profile/avatar/:width/:key",
      imageClass: "profile",
      preset: "avatar",
    },
  ])("adds bounded operational context to $imageClass delivery logs", async ({ route, normalizedRoute, imageClass, preset }) => {
    const logOffset = runtimeLogs.length;
    const response = await runtime.dispatchFetch(`https://images.tudomacae.com.br${route}`);
    expect(response.status).toBe(200);
    if (imageClass === "profile") expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    else expect(response.headers.get("x-request-id")).toBeNull();

    const event = await vi.waitFor(() => {
      const correlated = runtimeLogs.slice(logOffset).find(value =>
        value.includes(`route: '${normalizedRoute}'`) && value.includes(`imageClass: '${imageClass}'`) && value.includes(`preset: '${preset}'`),
      );
      expect(correlated).toBeDefined();
      return correlated;
    });
    expect(event).toContain("service: 'public-images'");
    expect(event).toContain("environment: 'qualification'");
    expect(event).toContain("outcome: 'success'");
    expect(event).toContain(`route: '${normalizedRoute}'`);
    expect(event).toContain("status: 200");
    expect(event).toContain("statusClass: '2xx'");
    expect(event).toMatch(/requestId: '[a-f0-9-]{36}'/);
    expect(event).not.toMatch(/request-context|ad-images|profile-photos|https:/);
  });

  test("emits a normalized structured event for a rejected image-route candidate", async () => {
    const logOffset = runtimeLogs.length;
    const response = await runtime.dispatchFetch("https://images.tudomacae.com.br/v1/unlisted/card/750/ad-images%2Fprivate-id%2Frequest-key.webp?signature=private-query-value");
    expect(response.status).toBe(400);

    const event = await vi.waitFor(() => {
      const correlated = runtimeLogs.slice(logOffset).find(value =>
        value.includes("reason: 'invalid_public_image_request'") && value.includes("route: '/v1/:class/:preset/:width/:key'"),
      );
      expect(correlated).toBeDefined();
      return correlated;
    });
    expect(event).toContain("event: 'public-image-delivery'");
    expect(event).toContain("service: 'public-images'");
    expect(event).toContain("environment: 'qualification'");
    expect(event).toContain("outcome: 'denied'");
    expect(event).toContain("status: 400");
    expect(event).toContain("statusClass: '4xx'");
    expect(event).toMatch(/requestId: '[a-f0-9-]{36}'/);
    expect(event).not.toMatch(/private-id|request-key|signature|private-query-value|imageClass:|preset:/);
  });

  test("denies a private prefix in the Worker runtime", async () => {
    const response = await runtime.dispatchFetch(
      "https://images.tudomacae.com.br/v1/ad/card/750/editorial%2Fprivate.webp",
    );
    expect(response.status).toBe(400);
  });

  test("an origin permission denial remains an error", async () => {
    const response = await runtime.dispatchFetch(
      "https://images.tudomacae.com.br/v1/ad/card/750/ad-images%2Fad-1%2Fprivate.webp",
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("x-image-result")).toBe("rejected");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("an uncached retired photo answers the origin's 410 and is never cached", async () => {
    const suffix = "uncached-retired.webp";
    retiredImageSuffixes.add(suffix);
    const url = `https://images.tudomacae.com.br/v1/ad/card/750/ad-images%2Fad-1%2F${suffix}`;
    for (const _attempt of [1, 2]) {
      const before = originRequests;
      const response = await runtime.dispatchFetch(url);
      expect(response.status).toBe(410);
      expect(response.headers.get("x-image-result")).toBe("gone");
      expect(response.headers.get("x-image-cache")).toBe("miss");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(originRequests).toBe(before + 1);
    }
  });
}
