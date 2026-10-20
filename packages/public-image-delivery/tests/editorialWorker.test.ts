import { editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "../probeAuthorization";
import { expect, test, vi } from "vitest";
import { createPublicImageWorker, type PublicImageCache } from "../worker";
import { editorialCacheProbeHeader, editorialCacheVariantHeader, publicImagePresetWidths } from "../contract";
import { publicImageCacheGeneration } from "../cacheTag";

const key = `editorial/photo/${"a".repeat(64)}`;
const url = `https://images.tudomacae.com.br/v1/editorial/hero/750/${encodeURIComponent(key)}`;
const configuration = {
  publicHost: "images.tudomacae.com.br",
  editorialOrigin: "https://www.tudomacae.com.br",
  editorialCacheProbeSecret: "test-probe-secret",
};
async function completeRequest() {
  const result = new Request(url, { method: "HEAD", headers: { [editorialCacheProbeHeader]: "all" } });
  result.headers.set(editorialCacheProbeAuthorizationHeader, await signEditorialCacheProbe(result, configuration.editorialCacheProbeSecret));
  return result;
}
function request(identity = true) {
  return new Request(url, { headers: identity
    ? {
        cookie: `ph_public-token_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "visitor" }))}`,
        authorization: "Bearer preview",
      }
    : {} });
}

function setup() {
  const cached = new Map<string, Response>();
  const cache: PublicImageCache = {
    match: async r => cached.get(r.url)?.clone(),
    put: async (r, response) => { cached.set(r.url, response.clone()); },
  };
  let authorized = true;
  let transforms = 0;
  const checkOrigin = vi.fn(async () => new Response(null, { status: authorized ? 200 : 404 }));
  const log = vi.fn();
  const worker = createPublicImageWorker({
    cache,
    checkOrigin,
    fetchOriginal: async () => new Response(authorized ? "original" : null, { status: authorized ? 200 : 404 }),
    transform: async (origin) => {
      expect(origin).toContain("/api/imagens/editorial/photo/");
      transforms++;
      return { response: new Response("transformed"), failure: "transformation" };
    },
    log,
  });
  return { worker, cached, log, checkOrigin, revoke: () => {
    authorized = false;
  }, transforms: () => transforms };
}

test("editorial hits serve the shared variant without reading the origin; retirement purges it", async () => {
  const fixture = setup();
  expect(await (await fixture.worker.fetch(request(), configuration)).text()).toBe("transformed");
  const reads = fixture.checkOrigin.mock.calls.length;
  expect(await (await fixture.worker.fetch(request(), configuration)).text()).toBe("transformed");
  expect(fixture.checkOrigin.mock.calls).toHaveLength(reads);
  expect(fixture.transforms()).toBe(1);
  expect([...fixture.cached.values()][0]?.headers.get("Cache-Tag")).toMatch(/^public-image-/);
  fixture.revoke();
  fixture.cached.clear();
  const denied = await fixture.worker.fetch(request(), configuration);
  expect(denied.status).toBe(404);
  expect(await denied.text()).not.toContain("transformed");
});

test("retirement probes inspect warm variants without identity, origin reads or image bytes", async () => {
  const fixture = setup();
  await fixture.worker.fetch(request(), configuration);
  fixture.revoke();
  fixture.checkOrigin.mockClear();
  const probe = () => fixture.worker.fetch(new Request(url, {
    method: "HEAD", headers: { [editorialCacheProbeHeader]: "1" },
  }), configuration);
  const warm = await probe();
  expect(warm.status).toBe(200);
  expect(await warm.text()).toBe("");
  fixture.cached.clear();
  const absent = await probe();
  expect(absent.status).toBe(404);
  expect(absent.headers.get(editorialCacheProbeHeader)).toBe("1");
  expect(fixture.checkOrigin).not.toHaveBeenCalled();
  expect(fixture.transforms()).toBe(1);
  expect((await fixture.worker.fetch(new Request(url, { headers: { [editorialCacheProbeHeader]: "1" } }), configuration)).status).toBe(400);
});

test("anonymous delivery transforms once and shares the warm entry across cookies", async () => {
  const fixture = setup();
  const cold = await fixture.worker.fetch(request(false), configuration);
  expect(await cold.text()).toBe("transformed");
  expect(cold.headers.get("x-image-cache")).toBe("miss");
  expect(cold.headers.get("cache-control")).toBe("private, no-store");
  expect(cold.headers.get("vary")).toBe("Accept");
  const reads = fixture.checkOrigin.mock.calls.length;
  const warm = await fixture.worker.fetch(request(), configuration);
  expect(await warm.text()).toBe("transformed");
  expect(warm.headers.get("x-image-cache")).toBe("hit");
  expect(fixture.checkOrigin.mock.calls).toHaveLength(reads);
  expect(fixture.transforms()).toBe(1);
  expect(JSON.stringify(fixture.log.mock.calls)).not.toMatch(/visitor|preview|public-token/);
});

test.each([
  url.replace("/hero/750/", "/card/750/"),
  url.replace("/hero/750/", "/hero/751/"),
  url.replace("images.tudomacae.com.br", "preview.example.com"),
  `${url}?origin=https://preview.example.com`,
  url.replace("a".repeat(64), "a".repeat(63)),
])("rejects an editorial request outside the closed origin/variant contract", async (invalid) => {
  const fixture = setup();
  expect((await fixture.worker.fetch(new Request(invalid), configuration)).status).toBe(400);
  expect(fixture.transforms()).toBe(0);
});

test.each(publicImagePresetWidths.editorial.hero.flatMap(width => (["avif", "webp", "jpeg"] as const).map(format => ({ width, format }))))(
  "complete probes find $width/$format without delivering bytes or reading origin",
  async ({ width, format }) => {
    const fixture = setup();
    const resident = new URL(url.replace("/750/", `/${width}/`));
    resident.searchParams.set("generation", publicImageCacheGeneration);
    resident.searchParams.set("format", format);
    fixture.cached.set(resident.href, new Response("private cached image"));
    const probe = async () => fixture.worker.fetch(await completeRequest(), configuration);
    const present = await probe();
    expect(present.status).toBe(200);
    expect(present.headers.get(editorialCacheProbeHeader)).toBe("all");
    expect(present.headers.get(editorialCacheVariantHeader)).toBe(`${width}/${format}`);
    expect(await present.text()).toBe("");
    fixture.cached.clear();
    const absent = await probe();
    expect(absent.status).toBe(404);
    expect(absent.headers.get(editorialCacheVariantHeader)).toBeNull();
    expect(await absent.text()).toBe("");
    expect(fixture.checkOrigin).not.toHaveBeenCalled();
    expect(fixture.transforms()).toBe(0);
    expect(fixture.cached.size).toBe(0);
  },
);

test("complete inspection bounds local cache concurrency and fails closed on cache errors", async () => {
  let active = 0;
  let peak = 0;
  const match = vi.fn(async () => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return undefined;
  });
  const put = vi.fn();
  const origin = vi.fn();
  const log = vi.fn();
  const worker = createPublicImageWorker({ cache: { match, put }, checkOrigin: origin,
    fetchOriginal: origin, transform: origin, log });
  const probe = async () => worker.fetch(await completeRequest(), configuration);
  expect((await probe()).status).toBe(404);
  expect(match).toHaveBeenCalledTimes(publicImagePresetWidths.editorial.hero.length * 3);
  expect(peak).toBe(5);
  match.mockRejectedValueOnce(Error("private cache details"));
  const failed = await probe();
  expect(failed.status).toBe(502);
  expect(await failed.text()).toBe("");
  expect(failed.headers.get(editorialCacheProbeHeader)).toBeNull();
  expect(log).toHaveBeenLastCalledWith(expect.objectContaining({ failure: "cache", status: 502 }));
  expect(JSON.stringify(log.mock.calls)).not.toContain("private cache details");
  expect(origin).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect((await worker.fetch(new Request(url, { headers: { [editorialCacheProbeHeader]: "all" } }), configuration)).status).toBe(400);
});

test.each(["missing", "wrong-secret", "expired", "different-key", "unconfigured"])("rejects complete probe %s before touching cache or origin", async (mode) => {
  const match = vi.fn();
  const origin = vi.fn();
  const log = vi.fn();
  const worker = createPublicImageWorker({ cache: { match, put: vi.fn() }, checkOrigin: origin, fetchOriginal: origin, transform: origin, log });
  const probe = new Request(url, { method: "HEAD", headers: { [editorialCacheProbeHeader]: "all" } });
  if (mode !== "missing") {
    const signed = mode === "different-key" ? new Request(url.replace("photo", "other"), probe) : probe;
    probe.headers.set(editorialCacheProbeAuthorizationHeader, await signEditorialCacheProbe(signed,
      mode === "wrong-secret" ? "other-secret" : configuration.editorialCacheProbeSecret,
      mode === "expired" ? Date.now() - 61000 : Date.now()));
  }
  const response = await worker.fetch(probe, { ...configuration, editorialCacheProbeSecret: mode === "unconfigured" ? undefined : configuration.editorialCacheProbeSecret });
  expect(response.status).toBe(403);
  expect(response.headers.get(editorialCacheProbeHeader)).toBeNull();
  expect(await response.text()).toBe("");
  expect(match).not.toHaveBeenCalled();
  expect(origin).not.toHaveBeenCalled();
  expect(log.mock.calls).toEqual([[{
    cache: "uninspected",
    ...(mode === "unconfigured" ? { failure: "configuration" } : {}),
    imageClass: "editorial",
    preset: "hero",
    result: "rejected",
    reason: "cache_probe_authorization",
    status: 403,
  }]]);
});
