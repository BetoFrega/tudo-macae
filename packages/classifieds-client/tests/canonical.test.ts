import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, vi } from "vitest";
import { canonicalLookupFreshHeader, canonicalLookupPath, createCanonicalLookup, parseCanonicalLookupPath, type CanonicalTarget } from "../canonical";

const protocol = { "x-classifieds-protocol": "1" };
const correlationId = "0123456789abcdef-GRU";

test.each<CanonicalTarget>([
  { kind: "ad", id: "ad id ç?" },
  { kind: "category", categoryId: "categoria" },
  { kind: "subcategory", categoryId: "categoria", subcategoryId: "área" },
  { kind: "profile", id: "__id42__" },
])("the lookup path round-trips $kind", (target) => {
  expect(parseCanonicalLookupPath(canonicalLookupPath(target))).toEqual(target);
});

test.each([
  "/api/classifieds/canonical/ads",
  "/api/classifieds/canonical/ads/a/b",
  "/api/classifieds/canonical/ads/..",
  "/api/classifieds/canonical/ads/%E0%A4%A",
  `/api/classifieds/canonical/ads/${"x".repeat(213)}`,
  "/api/classifieds/canonical/categories/a/other/b",
  "/api/classifieds/canonical/unknown/a",
  "/api/classifieds/authority",
])("rejects the lookup path %s", (path) => {
  expect(parseCanonicalLookupPath(path)).toBeNull();
});

test("asks for the target, revalidating only fresh lookups, and returns the Worker's answer", async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ exists: true, slug: "bicicleta" }, { headers: protocol }));
  const lookup = createCanonicalLookup({ origin: "https://api.test", publicOrigin: "https://public.test/path", request });
  expect(await lookup({ kind: "ad", id: "ad-id" }, { fresh: false, correlationId })).toEqual({ exists: true, slug: "bicicleta" });
  await lookup({ kind: "ad", id: "ad-id" }, { fresh: true, correlationId });
  const [[cachedUrl, cached], [, fresh]] = request.mock.calls as [URL, RequestInit][];
  expect(String(cachedUrl)).toBe("https://api.test/api/classifieds/canonical/ads/ad-id");
  expect(new Headers(cached.headers).has(canonicalLookupFreshHeader)).toBe(false);
  expect(new Headers(cached.headers).get("origin")).toBe("https://public.test");
  expect(new Headers(fresh.headers).get(canonicalLookupFreshHeader)).toBe("1");
  for (const init of [cached, fresh]) {
    expect(new Headers(init.headers).get("x-correlation-id")).toBe(correlationId);
    expect(new Headers(init.headers).get("x-request-id")).toBe(correlationId);
    expect(init.cache).toBeUndefined();
    expect(new Headers(init.headers).has("cache-control")).toBe(false);
    expect(init).toMatchObject({ next: { revalidate: 0 } });
  }
});

test("the platform fetch sends no HTTP cache directive, so only the freshness header bypasses the Worker cache", async () => {
  const received: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    received.push(request.headers);
    response.writeHead(200, { "content-type": "application/json", ...protocol }).end(JSON.stringify({ exists: false }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const lookup = createCanonicalLookup({ origin: `http://127.0.0.1:${port}`, publicOrigin: "https://public.test", allowLocal: true });
    await lookup({ kind: "ad", id: "ad-id" }, { fresh: false, correlationId });
    await lookup({ kind: "ad", id: "ad-id" }, { fresh: true, correlationId });
  }
  finally {
    server.close();
  }
  expect(received.map(headers => [headers["cache-control"], headers.pragma, headers[canonicalLookupFreshHeader]])).toEqual([
    [undefined, undefined, undefined],
    [undefined, undefined, "1"],
  ]);
});

test.each<[string, typeof fetch]>([
  ["a Worker without the endpoint", async () => new Response(null, { status: 404, headers: protocol })],
  ["a response outside the protocol", async () => Response.json({ exists: false })],
  ["an unavailable authority", async () => new Response(null, { status: 503, headers: protocol })],
  ["an incompatible answer", async () => Response.json({ exists: true }, { headers: protocol })],
  ["an unreadable body", async () => new Response("{", { headers: protocol })],
  ["a network failure", async () => { throw new TypeError("fetch failed"); }],
])("fails open on %s", async (_name, request) => {
  const lookup = createCanonicalLookup({ origin: "https://api.test", publicOrigin: "https://public.test", request });
  await expect(lookup({ kind: "ad", id: "ad-id" }, { fresh: false, correlationId })).resolves.toBeUndefined();
});

test("fails open once the deadline passes", async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
  try {
    const lookup = createCanonicalLookup({ origin: "https://api.test", publicOrigin: "https://public.test", request: async (_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    }) });
    const pending = lookup({ kind: "category", categoryId: "category" }, { fresh: false, correlationId });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeUndefined();
  }
  finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
