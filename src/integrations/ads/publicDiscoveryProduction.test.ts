import { afterEach, expect, test, vi } from "vitest";
vi.mock("@/features/categories/actions/getCategories", () => ({ getCategories: async () => [] }));
import { publicAdDiscovery } from "./publicDiscoveryProduction";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
test("discovery preserves the Worker next-page cursor through the Next composition", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "http://localhost:8787");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "http://localhost:3000");
  const page = { items: [], nextCursor: "worker-cursor" };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: { data: page } }, { headers: { "x-classifieds-protocol": "1" } })));
  expect(await publicAdDiscovery.read({ scope: { kind: "all" }, limit: 1 })).toEqual(page);
});
