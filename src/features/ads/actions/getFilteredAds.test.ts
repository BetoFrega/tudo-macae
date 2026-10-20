import { cacheLife, cacheTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { getFilteredAds, getFilteredAdsPage } from "./getFilteredAds";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/integrations/ads/publicDiscoveryProduction", async () => {
  const { createPublicAdDiscovery } = await import("@tudomacae/ads/publicDiscovery");
  const discovery = createPublicAdDiscovery({
    store: { read: async () => ({ items: [], scanned: 0, hasMore: false }) },
    taxonomy: async () => [{ id: "category-1", subcategories: [{ id: "subcategory-1" }] }],
  });
  vi.spyOn(discovery, "read");
  return { publicAdDiscovery: discovery };
});

describe("getFilteredAds", () => {
  test("rejects a cache-busting category/subcategory mismatch before entering the cache", async () => {
    vi.clearAllMocks();
    await expect(getFilteredAds({ categoryId: "irrelevant", subcategoryId: "subcategory-1" })).rejects.toThrow("inválida");
    expect(cacheLife).not.toHaveBeenCalled();
    expect(publicAdDiscovery.read).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("tags a category read with its category placement", async () => {
    const result = await getFilteredAds({ categoryId: "category-1" });

    expect(result).toEqual([]);
    expect(cacheLife).toHaveBeenCalledOnce();
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(cacheTag).toHaveBeenCalledOnce();
    expect(cacheTag).toHaveBeenCalledWith("ads-identity-deletion", "ads-category-category-1");
    expect(publicAdDiscovery.read).toHaveBeenCalledWith({ scope: { kind: "category", categoryId: "category-1" }, limit: 30 });
  });

  test("tags a subcategory read with its parent and specific placements", async () => {
    const result = await getFilteredAds({
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
    });

    expect(result).toEqual([]);
    expect(cacheLife).toHaveBeenCalledOnce();
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(cacheTag).toHaveBeenCalledOnce();
    expect(cacheTag).toHaveBeenCalledWith(
      "ads-identity-deletion", "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    );
    expect(publicAdDiscovery.read).toHaveBeenCalledWith({ scope: { kind: "subcategory", categoryId: "category-1", subcategoryId: "subcategory-1" }, limit: 30 });
  });
});

test("arbitrarily forged continuation positions never enter the persistent cache", async () => {
  vi.clearAllMocks();
  for (const createdAt of [1, 2, 3]) {
    const cursor = Buffer.from(JSON.stringify({
      key: JSON.stringify([{ kind: "category", categoryId: "category-1" }, 30]),
      after: { createdAt, id: "invented" },
    })).toString("base64url");
    expect(await getFilteredAdsPage({ categoryId: "category-1", cursor })).toEqual({ items: [] });
  }
  expect(publicAdDiscovery.read).toHaveBeenCalledTimes(3);
  expect(cacheLife).not.toHaveBeenCalled();
  expect(cacheTag).not.toHaveBeenCalled();
});
