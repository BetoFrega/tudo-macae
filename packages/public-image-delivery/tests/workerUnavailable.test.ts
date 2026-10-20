import { expect, test, vi } from "vitest";
import { createPublicImageWorker, type PublicImageLogEvent } from "../worker";
import { editorialCacheProbeHeader } from "../contract";
import { configuration, hostedOnly, memoryCache, validRequest } from "./workerFixture";

test.each([
  [403, 502, "rejected", "origin"],
  [404, 404, "not_found", undefined],
  [410, 410, "gone", undefined],
  [500, 502, "rejected", "origin"],
] as const)("a cold Hosted origin %i yields %i/%s without caching", async (origin, status, result, failure) => {
  for (const method of ["GET", "HEAD"]) {
    const logs: PublicImageLogEvent[] = [];
    const cache = memoryCache();
    const put = vi.spyOn(cache, "put");
    const worker = createPublicImageWorker({
      cache, ...hostedOnly,
      fetchOriginal: async () => new Response("origin body", { status: origin }),
      log: event => logs.push(event),
    });
    const response = await worker.fetch(new Request(validRequest(), { method }), configuration);
    expect(response.status).toBe(status);
    expect(response.headers.get("x-image-result")).toBe(result);
    expect(response.headers.get("x-image-cache")).toBe("miss");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("origin body");
    if (method === "HEAD") expect(body).toBe("");
    expect(put).not.toHaveBeenCalled();
    expect(logs).toEqual([{ cache: "miss", failure, imageClass: "ad", preset: "card", result, status }]);
  }
});

test.each([
  ["Ad", "/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp", "ad", "card"],
  ["Profile", "/v1/profile/avatar/128/profile-photos%2Fp-1%2Fphoto.webp", "profile", "avatar"],
  ["historical Profile", "/v1/remaining/profile/avatar/128/profile-photos%2Fp-1%2Fphoto.webp", "profile", "avatar"],
] as const)("%s photos without a valid Classifieds origin fail as configuration before any cache or origin access", async (_name, path, imageClass, preset) => {
  for (const classifiedsOrigin of [undefined, "http://api.tudomacae.com.br", "https://api.tudomacae.com.br/base"]) {
    for (const headers of [{}, { [editorialCacheProbeHeader]: "1" }]) {
      const cache = memoryCache();
      const match = vi.spyOn(cache, "match");
      const fetchOriginal = vi.fn(async () => new Response("bytes"));
      const logs: PublicImageLogEvent[] = [];
      const worker = createPublicImageWorker({ cache, ...hostedOnly, fetchOriginal, log: event => logs.push(event) });
      const response = await worker.fetch(new Request(validRequest(path), { method: "HEAD", headers }), {
        publicHost: configuration.publicHost, classifiedsOrigin, editorialOrigin: "https://www.tudomacae.com.br",
      });
      expect(response.status).toBe(502);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(logs).toEqual([{ cache: "miss", failure: "configuration", imageClass, preset, result: "rejected", status: 502 }]);
      expect(match).not.toHaveBeenCalled();
      expect(fetchOriginal).not.toHaveBeenCalled();
    }
  }
});
