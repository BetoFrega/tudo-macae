// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), profiles: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/integrations/ads/publication", () => ({ readPublication: mocks.read }));
vi.mock("@/packages/classifieds-api", () => ({ getUserAdvertiserProfilesUseCase: mocks.profiles }));
import { GET } from "./route";
const request = (id = "draft") => GET(new Request("https://example.test"), { params: Promise.resolve({ publicationId: id }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ uid: "owner" });
  mocks.read.mockResolvedValue({ id: "draft", title: "Bicicleta", images: [{ id: "photo", title: "Frente" }] });
  mocks.profiles.mockResolvedValue([]);
});
test("anonymous reads do not consult draft data and cannot be shared cached", async () => {
  mocks.user.mockResolvedValue(null);
  const response = await request();
  expect(response.status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
});
test("another owner's draft is concealed with private headers", async () => {
  mocks.read.mockRejectedValue(new Error("Publicação não encontrada nesta conta."));
  const response = await request();
  expect(response.status).toBe(404);
  expect(mocks.read).toHaveBeenCalledWith("owner", "draft");
  expect(mocks.profiles).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
});
test("authorized recovery returns private photo URLs and only the current user's profiles", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect((await response.json()).publication.images[0].url).toBe("/api/publicacoes-pendentes/draft/fotos/photo");
  expect(mocks.profiles).toHaveBeenCalledWith("owner");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
});
test("invalid identifiers never read authentication or storage", async () => {
  const response = await request("../other");
  expect(response.status).toBe(404);
  expect(mocks.user).not.toHaveBeenCalled();
});

test("provider failures preserve correlation without exposing private diagnostics", async () => {
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.read.mockRejectedValue(Object.assign(new Error("private provider detail"), { name: "PublicationReadUnavailable" }));
    const response = await request();
    expect(response.status).toBe(503);
    expect(JSON.parse(reported.mock.calls[0]![0])).toMatchObject({ cause: "PublicationReadUnavailable", operationId: response.headers.get("X-Operation-Id") });
    expect(JSON.stringify(await response.json())).not.toContain("private provider detail");
    expect(reported.mock.calls[0]![0]).not.toContain("private provider detail");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  }
  finally {
    reported.mockRestore();
  }
});
