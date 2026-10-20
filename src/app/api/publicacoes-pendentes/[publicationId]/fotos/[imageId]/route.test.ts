// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), photos: vi.fn() }));
vi.mock("@/packages/classifieds-api/photos", () => ({ classifiedsPhotos: mocks.photos, classifiedsPhotoCredential: async () => ({ session: "session" }) }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: mocks.user }));

import { GET } from "./route";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { PhotoError } from "@tudomacae/classifieds-photos";

beforeEach(() => {
  vi.clearAllMocks();
});

test("photo access denied to another account stays private and returns 404", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockResolvedValue({ uid: "other" });
    mocks.photos.mockReturnValue({ readAd: vi.fn().mockRejectedValue(new PhotoError("forbidden", "Foto não disponível nesta conta.")) });
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ publicationId: "pending", imageId: "00000000-0000-4000-8000-000000000001" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie, Accept");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("");
    expect(log).not.toHaveBeenCalled();
  }
  finally { log.mockRestore(); }
});

test("authentication failure preserves its sanitized cause and operation identifier", async () => {
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockRejectedValue(Object.assign(new Error("private authentication detail"), { name: "AuthenticationUnavailable" }));
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ publicationId: "pending", imageId: "00000000-0000-4000-8000-000000000001" }) });
    expect(response.status).toBe(503);
    expect(JSON.parse(reported.mock.calls[0]![0])).toMatchObject({
      cause: "AuthenticationUnavailable", operationId: response.headers.get("X-Operation-Id"),
    });
    expect(reported.mock.calls[0]![0]).not.toContain("private authentication detail");
  }
  finally {
    reported.mockRestore();
  }
});

test.each([false, true])("pending photo outages keep one reporting owner (%s)", async (reported) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockResolvedValue({ uid: "owner" });
    mocks.photos.mockReturnValue({ readAd: vi.fn().mockRejectedValue(new ClassifiedsRequestError("unavailable", crypto.randomUUID(), reported)) });
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ publicationId: "pending", imageId: "00000000-0000-4000-8000-000000000001" }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("X-Operation-Id")).toBeTruthy();
    expect(log).toHaveBeenCalledTimes(reported ? 0 : 1);
  }
  finally { log.mockRestore(); }
});
