import { afterEach, expect, test, vi } from "vitest";
import { GET, HEAD } from "./route";
import { PublicMediaReadFailure } from "@tudomacae/editorial-blog/publicMediaContent";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/packages/editorial/publicMediaProduction", () => ({ readPublicMediaContent: read }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

test("origin failures preserve bounded correlation and exclude credentials and exception text", async () => {
  vi.stubEnv("EDITORIAL_IMAGE_ORIGIN_ENABLED", "1");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValue(new PublicMediaReadFailure("storage"));
  const requestId = "01234567-89ab-cdef-0123-456789abcdef";
  const response = await GET(new Request(request, { headers: { "x-request-id": requestId, "cookie": "session=secret" } }), context);
  expect(response.status).toBe(502);
  expect(response.headers.get("x-request-id")).toBe(requestId);
  expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ requestId, stage: "storage", outcome: "failure", statusClass: "5xx", service: "nextjs", environment: expect.any(String), release: expect.any(String) });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-storage-path|secret|session/);
});
test("HEAD asks the origin read for no bytes", async () => {
  vi.stubEnv("EDITORIAL_IMAGE_ORIGIN_ENABLED", "1");
  read.mockResolvedValue({ bytes: new Uint8Array(), mimeType: "image/webp" });
  const response = await HEAD(request, context);
  expect([response.status, await response.text()]).toEqual([200, ""]);
  expect(read).toHaveBeenCalledWith("photo", "a".repeat(64), expect.any(String), "HEAD");
});

test("a failure the Worker already logged answers 502 without a second log", async () => {
  vi.stubEnv("EDITORIAL_IMAGE_ORIGIN_ENABLED", "1");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValue(new PublicMediaReadFailure("worker", true));
  expect((await GET(request, context)).status).toBe(502);
  expect(log).not.toHaveBeenCalled();
});
const context = { params: Promise.resolve({ mediaId: "photo", digest: "a".repeat(64) }) };
const request = new Request("https://www.tudomacae.com.br/api/imagens/editorial/photo/version", { headers: { authorization: "Bearer editor-preview", cookie: "session=editor" } });

test("the new origin remains dormant until separately configured", async () => {
  vi.stubEnv("EDITORIAL_IMAGE_ORIGIN_ENABLED", "");
  expect((await GET(request, context)).status).toBe(404);
  expect(read).not.toHaveBeenCalled();
});

test("an authenticated editor never gets preview bytes through the public origin", async () => {
  vi.stubEnv("EDITORIAL_IMAGE_ORIGIN_ENABLED", "1");
  read.mockResolvedValue(null);
  const response = await GET(request, context);
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test("GET and HEAD share the authorization result and never enable CDN caching", async () => {
  vi.stubEnv("EDITORIAL_IMAGE_ORIGIN_ENABLED", "1");
  read.mockResolvedValue({ bytes: new Uint8Array([1, 2]), mimeType: "image/webp" });
  const get = await GET(request, context);
  const head = await HEAD(request, context);
  expect([...new Uint8Array(await get.arrayBuffer())]).toEqual([1, 2]);
  expect(await head.text()).toBe("");
  expect(head.status).toBe(200);
  expect(head.headers.get("CDN-Cache-Control")).toBe("no-store");
});
