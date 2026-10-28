import { expect, test, vi } from "vitest";
import type { AdScope } from "@tudomacae/ads/publicDiscovery";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { CategoryContent } from "./page";
import { SubcategoryContent } from "./[subcategoryId]/[subcategorySlug]/page";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
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
  getCategoriesUseCase: async () => [{
    id: "category-id",
    slug: "veiculos",
    subcategories: [{ id: "subcategory-id", slug: "motos", isActive: true }],
  }],
}));
// The real cursor rules with a store that always offers a continuation.
vi.mock("@/integrations/ads/publicDiscoveryProduction", async () => {
  const { createPublicAdDiscovery } = await import("@tudomacae/ads/publicDiscovery");
  return {
    publicAdDiscovery: createPublicAdDiscovery({
      store: { read: async () => ({ items: [], scanned: 31, hasMore: true, lastScanned: { createdAt: 1, id: "last" } }) },
      taxonomy: async () => [{ id: "category-id", subcategories: [{ id: "subcategory-id" }] }],
    }),
  };
});

async function issuedCursor(scope: AdScope) {
  const page = await publicAdDiscovery.read(publicAdDiscovery.canonical({ scope }));
  return page.nextCursor!;
}

const listings = [
  {
    name: "category",
    current: "/categoria/category-id/veiculos",
    scope: { kind: "category", categoryId: "category-id" } as const,
    render: (adCursor: string) => CategoryContent({
      params: Promise.resolve({ categoryId: "category-id", categorySlug: "titulo-anterior" }),
      searchParams: Promise.resolve({ adCursor }),
    }),
  },
  {
    name: "subcategory",
    current: "/categoria/category-id/veiculos/subcategory-id/motos",
    scope: { kind: "subcategory", categoryId: "category-id", subcategoryId: "subcategory-id" } as const,
    render: (adCursor: string) => SubcategoryContent({
      params: Promise.resolve({ categoryId: "category-id", categorySlug: "veiculos", subcategoryId: "subcategory-id", subcategorySlug: "titulo-anterior" }),
      searchParams: Promise.resolve({ adCursor }),
    }),
  },
];

test.each(listings)("a stale $name slug keeps an accepted continuation on the canonical ads section", async ({ current, scope, render }) => {
  const cursor = await issuedCursor(scope);

  await expect(render(cursor)).rejects.toThrow(new Error(`NEXT_REDIRECT ${current}?adCursor=${encodeURIComponent(cursor)}#anuncios`));
});

test.each(listings)("a stale $name slug drops a rejected continuation", async ({ current, render }) => {
  await expect(render("broken")).rejects.toThrow(new Error(`NEXT_REDIRECT ${current}`));
});
