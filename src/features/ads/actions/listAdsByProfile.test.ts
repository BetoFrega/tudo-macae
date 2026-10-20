import { cacheLife, cacheTag } from "next/cache";
import { expect, test, vi } from "vitest";
import { listAdsByProfilePage } from "./listAdsByProfile";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/integrations/ads/publicDiscoveryProduction", async () => {
  const { createPublicAdDiscovery } = await import("@tudomacae/ads/publicDiscovery");
  return { publicAdDiscovery: createPublicAdDiscovery({
    store: { read: async () => ({ items: [], scanned: 0, hasMore: false }) }, taxonomy: async () => [],
  }) };
});

test("profile first pages are cached, but arbitrary continuation positions are not", async () => {
  await listAdsByProfilePage("profile");
  expect(cacheLife).toHaveBeenCalledWith("minutes");
  expect(cacheTag).toHaveBeenCalledWith("ads-by-profile-profile");
  vi.clearAllMocks();
  for (const createdAt of [1, 2]) {
    const cursor = Buffer.from(JSON.stringify({
      key: JSON.stringify([{ kind: "profile", profileId: "profile" }, 30]),
      after: { createdAt, id: "invented" },
    })).toString("base64url");
    expect(await listAdsByProfilePage("profile", cursor)).toEqual({ items: [] });
  }
  expect(cacheLife).not.toHaveBeenCalled();
  expect(cacheTag).not.toHaveBeenCalled();
});
