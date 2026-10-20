import { expect, test, vi } from "vitest";
import type { PhotoRecord } from "@tudomacae/classifieds-photos";
import { authorizeEditorialCacheProbe, deriveEditorialCacheProbeSecret } from "@tudomacae/public-image-delivery/probeAuthorization";
import { createHostedPhotoVisibilityVerifier } from "../lib/hostedPhotoVisibility";

const record = { path: "ad-images/ad-1/photo.webp", ownerKind: "ad", operationId: "00000000-0000-4000-8000-000000000001" } as PhotoRecord;

const context = { environment: "production", release: "release-1" };

function setup(edge: (request: Request) => Response, purgeToken: string | undefined = "purge-token") {
  const requests: Request[] = [];
  const record = (url: string | URL | Request, init?: RequestInit) => {
    const request = new Request(url, init);
    requests.push(request);
    return request;
  };
  const send = vi.fn<typeof fetch>(async (url, init) => edge(record(url, init)));
  const sendOrigin = vi.fn<typeof fetch>(async (url, init) => {
    record(url, init);
    return new Response(null, { status: 410 });
  });
  const verify = createHostedPhotoVisibilityVerifier({ send, sendOrigin, classifiedsOrigin: "https://api.example", imageOrigin: "https://images.example", purgeToken, wait: async () => {}, context });
  return { verify, requests, send, sendOrigin };
}

test("observes the origin through the loopback and the edge through the network", async () => {
  const { verify, send, sendOrigin } = setup(() => new Response(null, { status: 404, headers: { "x-editorial-cache-probe": "all" } }));
  expect(await verify(record)).toBe(true);
  expect(sendOrigin.mock.calls.map(([url]) => new URL(String(url)).host)).toEqual(["api.example", "api.example"]);
  expect(send.mock.calls.map(([url]) => new URL(String(url)).host)).toEqual(["images.example", "images.example"]);
});

test("observes the origin and a signed complete cache probe twice, never reading image bytes", async () => {
  const secret = await deriveEditorialCacheProbeSecret("purge-token");
  const { verify, requests } = setup(() => new Response(null, { status: 404, headers: { "x-editorial-cache-probe": "all" } }));
  expect(await verify(record)).toBe(true);
  expect(requests.map(request => request.method)).toEqual(["HEAD", "HEAD", "HEAD", "HEAD"]);
  const edge = requests.filter(request => request.url.startsWith("https://images.example/"));
  expect(edge).toHaveLength(2);
  for (const request of edge) {
    expect(request.headers.get("x-editorial-cache-probe")).toBe("all");
    expect(await authorizeEditorialCacheProbe(request, secret)).toBe(true);
  }
});

test.each([
  ["a resident variant", new Response(null, { status: 200, headers: { "x-editorial-cache-probe": "all" } })],
  ["a Worker without the complete probe", new Response(null, { status: 404 })],
  ["an unavailable Worker", new Response(null, { status: 502 })],
])("%s keeps the photo visible", async (_name, response) => {
  const { verify } = setup(() => response.clone());
  expect(await verify(record)).toBe(false);
});

test("an unconfigured purge token cannot prove absence", async () => {
  const { verify, requests } = setup(() => new Response(null, { status: 404, headers: { "x-editorial-cache-probe": "all" } }), "");
  expect(await verify(record)).toBe(false);
  expect(requests).toHaveLength(0);
});

test("a failed observation names its target before propagating", async () => {
  const logs = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const send = vi.fn<typeof fetch>(async (url) => {
      if (String(url).startsWith("https://images.example/")) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(null, { status: 410 });
    });
    const verify = createHostedPhotoVisibilityVerifier({ send, sendOrigin: send, classifiedsOrigin: "https://api.example", imageOrigin: "https://images.example", purgeToken: "purge-token", wait: async () => {}, context });
    await expect(verify(record)).rejects.toThrow("timeout");
    expect(JSON.parse(String(logs.mock.calls[0]![0]))).toEqual({ event: "classifieds.photos.visibility_request_failed", service: "api-worker",
      environment: "production", release: "release-1", outcome: "failure", operationId: record.operationId, target: "edge", host: "images.example", errorName: "TimeoutError" });
  }
  finally { logs.mockRestore(); }
});
