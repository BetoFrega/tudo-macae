import { expect, test, vi } from "vitest";
import { createCloudflareImageOrigin } from "./transform";

test("translates delivery policy into Cloudflare options without following redirects", async () => {
  const fetchOrigin = vi.fn<typeof fetch>(async () => new Response("image"));
  const origin = createCloudflareImageOrigin(fetchOrigin);
  const result = await origin.transform("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest?cache_generation=2", {
    width: 750, format: "avif", quality: 75, resize: "scale-down", preserveAnimation: false, stripMetadata: true,
  });
  expect(await result.response.text()).toBe("image");
  expect(fetchOrigin).toHaveBeenCalledWith("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest?cache_generation=2", {
    redirect: "manual",
    cf: { image: { width: 750, format: "avif", quality: 75, fit: "scale-down", anim: false, metadata: "none" } },
  });
});

test.each([[{ "cf-resized": "err=9523" }, "transformation"], [{}, "origin"]])(
  "classifies unsuccessful provider responses with headers %j", async (headers, failure) => {
    const origin = createCloudflareImageOrigin(async () => new Response(null, { status: 502, headers }));
    expect((await origin.transform("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest", {
      width: 64, format: "webp", quality: 75, resize: "scale-down", preserveAnimation: false, stripMetadata: true,
    })).failure).toBe(failure);
  },
);

test("origin checks bypass both caches and use only the canonical object path", async () => {
  const fetchOrigin = vi.fn<typeof fetch>(async () => new Response(null));
  const origin = createCloudflareImageOrigin(fetchOrigin);
  await origin.checkOrigin("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest?cache_generation=2");
  expect(fetchOrigin).toHaveBeenCalledWith(new URL("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest"), {
    method: "HEAD", cache: "no-store", redirect: "manual", signal: expect.any(AbortSignal),
  });
  await origin.fetchOriginal("https://api.tudomacae.com.br/api/classifieds/photos/public/key?w=128&format=avif&cache_generation=2");
  expect(fetchOrigin).toHaveBeenLastCalledWith("https://api.tudomacae.com.br/api/classifieds/photos/public/key?w=128&format=avif&cache_generation=2", { redirect: "manual" });
});

test("editorial origin operations propagate only a generated request identifier", async () => {
  const fetchOrigin = vi.fn<typeof fetch>(async () => new Response(null));
  const origin = createCloudflareImageOrigin(fetchOrigin, "operation-123");
  await origin.checkOrigin("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest");
  await origin.fetchOriginal("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest");
  await origin.transform("https://www.tudomacae.com.br/api/imagens/editorial/photo/digest", {
    width: 750, format: "avif", quality: 75, resize: "scale-down", preserveAnimation: false, stripMetadata: true,
  });
  for (const [, init] of fetchOrigin.mock.calls) {
    expect(init?.headers).toEqual({ "x-request-id": "operation-123" });
  }
});

test("uses the bound editorial origin for authorization and originals while transforming through global fetch", async () => {
  const fetchTransform = vi.fn<typeof fetch>(async () => new Response("transformed"));
  const readOrigin = vi.fn<typeof fetch>(async () => new Response("original"));
  const origin = createCloudflareImageOrigin(fetchTransform, "operation-123", readOrigin);
  const url = "https://www.tudomacae.com.br/api/imagens/editorial/photo/digest?cache_generation=2";
  await origin.checkOrigin(url);
  expect(await (await origin.fetchOriginal(url)).text()).toBe("original");
  expect(fetchTransform).not.toHaveBeenCalled();
  expect(readOrigin).toHaveBeenCalledTimes(2);
  expect(readOrigin.mock.calls[0]).toEqual([new URL(url.split("?")[0]!), {
    headers: { "x-request-id": "operation-123" }, method: "HEAD", cache: "no-store",
    redirect: "manual", signal: expect.any(AbortSignal),
  }]);
  expect(await (await origin.transform(url, {
    width: 750, format: "webp", quality: 75, resize: "scale-down", preserveAnimation: false, stripMetadata: true,
  })).response.text()).toBe("transformed");
  expect(fetchTransform).toHaveBeenCalledTimes(1);
  expect(readOrigin).toHaveBeenCalledTimes(2);
});
