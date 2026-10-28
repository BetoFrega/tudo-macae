import { expect, test, vi } from "vitest";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { BusinessContent } from "./page";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  connection: async () => {},
}));
vi.mock("next/navigation", async importOriginal => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/packages/classifieds-api", () => ({
  getBusinessUseCase: async ({ id }: { id: string }) => ({ id, title: "Café com Arte" }),
  getCategoriesUseCase: async () => [],
}));
// The real cursor rules with a store that always offers a continuation.
vi.mock("@/integrations/ads/publicDiscoveryProduction", async () => {
  const { createPublicAdDiscovery } = await import("@tudomacae/ads/publicDiscovery");
  return {
    publicAdDiscovery: createPublicAdDiscovery({
      store: { read: async () => ({ items: [], scanned: 31, hasMore: true, lastScanned: { createdAt: 1, id: "last" } }) },
      taxonomy: async () => [],
    }),
  };
});

const render = (adCursor: string) => BusinessContent({
  params: Promise.resolve({ id: "business-id", slug: "titulo-anterior" }),
  searchParams: Promise.resolve({ adCursor }),
});

test("a stale business slug keeps an accepted continuation on the canonical ads section", async () => {
  const page = await publicAdDiscovery.read(publicAdDiscovery.canonical({ scope: { kind: "profile", profileId: "business-id" } }));
  const cursor = page.nextCursor!;

  await expect(render(cursor)).rejects.toThrow(new Error(`NEXT_REDIRECT /negocio/business-id/cafe-com-arte?adCursor=${encodeURIComponent(cursor)}#anuncios`));
});

test("a stale business slug drops a rejected continuation", async () => {
  await expect(render("broken")).rejects.toThrow(new Error("NEXT_REDIRECT /negocio/business-id/cafe-com-arte"));
});
