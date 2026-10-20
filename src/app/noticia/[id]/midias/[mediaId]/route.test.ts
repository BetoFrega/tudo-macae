import { afterEach, expect, test, vi } from "vitest";
import { PublicBlogRequestError } from "@tudomacae/editorial-blog/publicClient";
import { GET } from "./route";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/packages/editorial/articleLifecycleProduction", () => ({ readPublishedArticleMedia: read }));
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

const context = { params: Promise.resolve({ id: "post", mediaId: "photo" }) };
const url = "https://www.tudomacae.com.br/noticia/post/midias/photo";

test("the caller's request ID reaches the read and comes back on the response", async () => {
  const requestId = "01234567-89ab-cdef-0123-456789abcdef";
  read.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "image/webp" });
  const response = await GET(new Request(url, { headers: { "x-request-id": requestId } }), context);
  expect(read).toHaveBeenCalledWith("post", "photo", requestId);
  expect(response.headers.get("x-request-id")).toBe(requestId);
});

test("a malformed request ID is replaced, never forwarded", async () => {
  read.mockResolvedValue(null);
  const response = await GET(new Request(url, { headers: { "x-request-id": "not-an-id" } }), context);
  expect(response.status).toBe(404);
  const forwarded = read.mock.calls[0]![2];
  expect(forwarded).toMatch(/^[a-f0-9-]{36}$/);
  expect(response.headers.get("x-request-id")).toBe(forwarded);
});

test("a Worker failure answers 502 with the request ID and logs only what the Worker did not", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValueOnce(new PublicBlogRequestError("unavailable", 503, true));
  const reported = await GET(new Request(url), context);
  expect(reported.status).toBe(502);
  expect(reported.headers.get("x-request-id")).toBe(read.mock.calls[0]![2]);
  expect(error).not.toHaveBeenCalled();

  read.mockRejectedValueOnce(new PublicBlogRequestError("incompatible"));
  expect((await GET(new Request(url), context)).status).toBe(502);
  expect(error).toHaveBeenCalledTimes(1);
});
