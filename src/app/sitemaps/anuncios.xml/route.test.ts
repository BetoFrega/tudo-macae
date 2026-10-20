import { beforeEach, expect, test, vi } from "vitest";
import { getAdSitemap } from "@/integrations/ads/adSitemapProduction";
import { GET } from "./route";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/integrations/ads/adSitemapProduction", () => ({ AD_SITEMAP_CACHE_SECONDS: 3600, getAdSitemap: vi.fn() }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

const events = (log: "info" | "error") => vi.mocked(console[log]).mock.calls.map(call => JSON.parse(String(call[0])));

test("serves one cacheable URL set with lastmod and records its URL count", async () => {
  vi.mocked(getAdSitemap).mockResolvedValue({ truncated: false, entries: [
    { id: "ad-1", slug: "bicicleta", lastModified: Date.UTC(2026, 9, 11) },
    { id: "ad 2", slug: "mesa" },
  ] });
  const response = await GET(new Request("https://example.test/"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  expect(response.headers.get("Content-Type")).toBe("application/xml");
  const xml = await response.text();
  expect(xml).toContain("<urlset");
  expect(xml).toContain("<url><loc>https://www.tudomacae.com.br/anuncio/ad-1/bicicleta</loc><lastmod>2026-10-11T00:00:00.000Z</lastmod></url>");
  expect(xml).toContain("<url><loc>https://www.tudomacae.com.br/anuncio/ad%202/mesa</loc></url>");
  expect(xml).not.toContain("<sitemap>");
  expect(events("info")).toEqual([expect.objectContaining({ event: "ad-sitemap.rendered", route: "/sitemaps/anuncios.xml", urlCount: 2, outcome: "completed" })]);
  expect(console.error).not.toHaveBeenCalled();
});

test("reports truncation as an error while serving the bounded URL set", async () => {
  vi.mocked(getAdSitemap).mockResolvedValue({ truncated: true, entries: [{ id: "ad", slug: "anuncio" }] });
  const response = await GET(new Request("https://example.test/", { headers: { "x-www-request-id": "0123456789abcdef-GRU" } }));
  expect(response.status).toBe(200);
  expect(events("error")).toEqual([{ event: "ad-sitemap.limit_exceeded", service: "nextjs", environment: expect.any(String),
    release: expect.any(String), route: "/sitemaps/anuncios.xml", urlCount: 1, requestId: "0123456789abcdef-GRU", outcome: "degraded" }]);
});

test("does not publish an empty URL set when no public ads exist", async () => {
  vi.mocked(getAdSitemap).mockResolvedValue({ truncated: false, entries: [] });
  const response = await GET(new Request("https://example.test/"));
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(events("info")).toEqual([expect.objectContaining({ event: "ad-sitemap.rendered", urlCount: 0 })]);
  expect(console.error).not.toHaveBeenCalled();
});

test.each([
  [{ code: 14, message: "private token" }, "unavailable"],
  [new TypeError("private token"), "invalid-data"],
])("correlates read outages without exposing provider details", async (error, errorClass) => {
  vi.mocked(getAdSitemap).mockRejectedValue(error);
  const response = await GET(new Request("https://example.test/"));
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(console.error).toHaveBeenCalledOnce();
  const event = JSON.parse(vi.mocked(console.error).mock.calls[0][0]);
  expect(event).toEqual({ event: "ad-sitemap.read_failed", service: "nextjs", environment: expect.any(String),
    release: expect.any(String), outcome: "failed", route: "/sitemaps/anuncios.xml", statusClass: "5xx",
    errorClass, requestId: response.headers.get("x-request-id") });
  expect(event.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(event)).not.toContain("private token");
});

test.each(["0123456789abcdef-GRU", "0123456789abcdef", "private token", "x".repeat(200)])("preserves only valid edge correlation on read failure (%s)", async (incoming) => {
  vi.mocked(getAdSitemap).mockRejectedValue({ code: 14 });
  const response = await GET(new Request("https://example.test/", { headers: { "x-www-request-id": incoming } }));
  const requestId = response.headers.get("x-request-id");
  if (incoming.startsWith("0123456789abcdef")) expect(requestId).toBe(incoming);
  else expect(requestId).toMatch(/^[a-f0-9-]{36}$/u);
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0]).requestId).toBe(requestId);
});

test("reports truncation when the largest allowed URL set would exceed the 50 MB sitemap limit", async () => {
  const slug = "a".repeat(1024);
  const entries = Array.from({ length: 50_000 }, (_, index) => ({ id: `ad-${index}`.padEnd(200, "x"), slug }));
  vi.mocked(getAdSitemap).mockResolvedValue({ truncated: false, entries });
  const response = await GET(new Request("https://example.test/"));
  const xml = await response.text();
  expect(new TextEncoder().encode(xml).length).toBeLessThanOrEqual(52_428_800);
  expect(xml).toContain("/anuncio/ad-0x");
  expect(xml).not.toContain("ad-49999");
  expect(events("error")).toEqual([expect.objectContaining({ event: "ad-sitemap.limit_exceeded", outcome: "degraded" })]);
});
