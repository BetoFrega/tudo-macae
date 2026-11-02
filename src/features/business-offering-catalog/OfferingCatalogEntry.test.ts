import { expect, test, vi } from "vitest";

const available = vi.hoisted(() => vi.fn());
vi.mock("@/packages/classifieds-api/offerings", () => ({ offeringCatalogAvailable: available }));
const { OfferingCatalogEntry } = await import("./OfferingCatalogEntry");

test.each(["disabled", "outside_audience", "unavailable"] as const)("a %s catalog flag offers no management link", async (decision) => {
  available.mockResolvedValue(decision);
  expect(await OfferingCatalogEntry({ businessId: "business" })).toBeNull();
});

test("a released catalog links to its management page", async () => {
  available.mockResolvedValue("enabled");
  expect(await OfferingCatalogEntry({ businessId: "business" })).toMatchObject({ props: { href: "/minha-conta/negocios/business/catalogo" } });
});
