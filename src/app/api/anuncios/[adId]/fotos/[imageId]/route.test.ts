// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/packages/classifieds-api/photos", () => ({ classifiedsPhotos: () => ({ readAd: mocks.read }) }));

import { GET } from "./route";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";

const adId = "pending-ad";
const imageId = "00000000-0000-4000-8000-000000000001";
const request = new Request(`https://example.test/api/anuncios/${adId}/fotos/${imageId}`);
const params = Promise.resolve({ adId, imageId });

beforeEach(() => {
  vi.clearAllMocks();
});

test("pending and interrupted publications never expose a private photo", async () => {
  mocks.read.mockResolvedValue(null);
  expect((await GET(request, { params })).status).toBe(404);
});

test("serves a photo only when the access use case authorizes it", async () => {
  mocks.read.mockResolvedValue({ bytes: Buffer.from("photo"), mimeType: "image/png" });
  const response = await GET(request, { params });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).toBe("photo");
  mocks.read.mockResolvedValue(null);
  expect((await GET(request, { params })).status).toBe(404);
  expect(mocks.read).toHaveBeenCalledWith(adId, imageId, false, {}, expect.any(String), undefined, undefined);
});

test("bounded responsive width reaches the media reader", async () => {
  mocks.read.mockResolvedValue({ bytes: Buffer.from("photo"), mimeType: "image/webp" });
  const response = await GET(new Request(`${request.url}?w=384`), { params });
  expect(response.status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(adId, imageId, false, {}, expect.any(String), 384, undefined);
  expect((await GET(new Request(`${request.url}?w=9999`), { params })).status).toBe(400);
});

test("accepts a valid publication identifier with a dot", async () => {
  mocks.read.mockResolvedValue({ bytes: Buffer.from("photo"), mimeType: "image/png" });
  const dottedId = "publication.2026";
  const response = await GET(new Request(`https://example.test/api/anuncios/${dottedId}/fotos/${imageId}`), {
    params: Promise.resolve({ adId: dottedId, imageId }),
  });
  expect(response.status).toBe(200);
});

test.each([false, true])("photo outages keep one reporting owner (%s)", async (reported) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.read.mockRejectedValue(new ClassifiedsRequestError("unavailable", crypto.randomUUID(), reported));
    const response = await GET(request, { params });
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Operation-Id")).toBeTruthy();
    expect(log).toHaveBeenCalledTimes(reported ? 0 : 1);
  }
  finally { log.mockRestore(); }
});
