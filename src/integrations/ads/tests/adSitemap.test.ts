import { afterEach, expect, test, vi } from "vitest";
import { readAdSitemapEntries } from "../adSitemapProduction";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("reads ask the Worker for the bounded projection", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "http://localhost:8787");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "http://localhost:3000");
  const entries = [{ id: "new-ad", slug: "new", lastModified: 100 }];
  const fetch = vi.fn().mockResolvedValue(Response.json({ result: { data: entries } }, { headers: { "x-classifieds-protocol": "1" } }));
  vi.stubGlobal("fetch", fetch);
  expect(await readAdSitemapEntries()).toEqual(entries);
  const input = new URL(String(fetch.mock.calls[0]![0])).searchParams.get("input")!;
  expect(JSON.parse(input)).toEqual({ operation: "ads.sitemap", input: {} });
});
