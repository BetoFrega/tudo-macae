import { beforeEach, expect, test, vi } from "vitest";
import { OfferingCatalogError } from "@tudomacae/advertiser-identity/offeringCatalog";

const mocks = vi.hoisted(() => ({ readManagement: vi.fn() }));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  connection: async () => {},
}));
vi.mock("next/navigation", async importOriginal => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
}));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: async () => ({ uid: "owner", isAdmin: false }) }));
vi.mock("@/packages/classifieds-api/offerings", () => ({ offeringCatalog: { readManagement: mocks.readManagement } }));
const { CatalogContent } = await import("./page");

const render = () => CatalogContent({ params: Promise.resolve({ businessId: "business" }), searchParams: Promise.resolve({}) });
beforeEach(() => {
  mocks.readManagement.mockReset();
});

test.each(["disabled", "outside_audience", "unavailable"] as const)("a %s catalog flag answers the management page with not found", async (decision) => {
  mocks.readManagement.mockRejectedValue(new OfferingCatalogError(decision));
  await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
});

test("a released catalog renders its manager", async () => {
  mocks.readManagement.mockResolvedValue({ enabled: false, revision: 0, items: [] });
  await expect(render()).resolves.toBeTruthy();
  expect(mocks.readManagement).toHaveBeenCalledWith({ businessId: "business", actor: { id: "owner", admin: false } });
});
