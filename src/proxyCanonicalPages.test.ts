import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CanonicalLookup, CanonicalTarget } from "@tudomacae/classifieds-client/canonical";
import { createProxy } from "./proxyHandler";

/** Current answers by lookup path; `stale` overrides what the colo cache would still return. */
const current: Record<string, unknown> = {
  "ad:ad-id": { exists: true, slug: "bicicleta-aro-29" },
  "category:category-id": { exists: true, slug: "veiculos" },
  "subcategory:category-id/subcategory-id": { exists: true, categorySlug: "veiculos", slug: "motos" },
  "profile:business-id": { exists: true, businessTitle: "Café com Arte" },
  "profile:personal-id": { exists: true },
};
const stale: Record<string, unknown> = {};
function key(target: CanonicalTarget) {
  if (target.kind === "category") return `category:${target.categoryId}`;
  if (target.kind === "subcategory") return `subcategory:${target.categoryId}/${target.subcategoryId}`;
  return `${target.kind}:${target.id}`;
}
const lookup = vi.fn(async (target: CanonicalTarget, { fresh }: { fresh: boolean }) => {
  const name = key(target);
  if (name.includes("unavailable")) return undefined;
  return (!fresh && name in stale ? stale[name] : current[name]) ?? { exists: false };
}) as unknown as ReturnType<typeof vi.fn> & CanonicalLookup;
const canonicalLookup = vi.fn(() => Promise.resolve(lookup));
const proxy = createProxy({ canonicalLookup });

describe("business canonical redirects", () => {
  test.each(["__invalid__", "x".repeat(213)])("answers 404 for invalid public profile IDs without a lookup", async (id) => {
    lookup.mockClear();
    for (const path of ["/anunciante/" + id, "/negocio/" + id + "/slug"]) {
      const response = await proxy(new NextRequest("http://localhost" + path));
      expect(response.status).toBe(404);
      expect(response.headers.has("location")).toBe(false);
    }
    const legacy = await proxy(new NextRequest("http://localhost/negocios/" + id));
    expect(legacy.headers.get("x-middleware-next")).toBe("1");
    expect(lookup).not.toHaveBeenCalled();
  });

  test.each(["/anuncio/" + "x".repeat(201), "/anuncio/" + "x".repeat(201) + "/slug"])("answers 404 for an invalid ad ID without a lookup (%s)", async (path) => {
    lookup.mockClear();
    const response = await proxy(new NextRequest("http://localhost" + path));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Anúncio não encontrado");
    expect(lookup).not.toHaveBeenCalled();
  });

  test.each(["adCursor=issued", "adCursor=broken", "adCursor=first&adCursor=second"])("preserves legacy continuation input for page validation (%s)", async (query) => {
    for (const path of ["/anunciante/business-id", "/negocios/business-id"]) {
      const response = await proxy(new NextRequest("http://localhost" + path + "?" + query));
      const destination = new URL(response.headers.get("location")!);
      expect(response.status).toBe(308);
      expect(destination.pathname).toBe("/negocio/business-id/cafe-com-arte");
      expect(destination.searchParams.getAll("adCursor")).toEqual(new URLSearchParams(query).getAll("adCursor"));
      expect(destination.hash).toBe("#anuncios");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  test.each([
    ["/anunciante/business-id", "/negocio/business-id/cafe-com-arte"],
    ["/negocios/business-id", "/negocio/business-id/cafe-com-arte"],
    ["/negocio/business-id/nome-antigo", "/negocio/business-id/cafe-com-arte"],
  ])("redirects %s permanently without letting a cache keep the redirect", async (pathname, expected) => {
    const response = await proxy(new NextRequest(`http://localhost${pathname}`));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`http://localhost${expected}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test.each(["issued", "broken", ""])("delegates paginated business slug recovery to the page (%s)", async (cursor) => {
    const response = await proxy(new NextRequest("http://localhost/negocio/business-id/nome-antigo?adCursor=" + cursor));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
  });

  test.each(["issued", "broken", "", "first&adCursor=second"])("retains legacy advertiser pagination during the business transition (%s)", async (cursor) => {
    const request = new NextRequest("http://localhost/anunciante/business-id?adCursor=" + cursor + "#anuncios");
    const response = await proxy(request);
    expect(response.status).toBe(308);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/negocio/business-id/cafe-com-arte");
    expect(target.search).toBe(request.nextUrl.search);
    expect(target.hash).toBe("#anuncios");
  });

  test("renders canonical Businesses and public Profiles, and answers 404 for missing ones", async () => {
    for (const path of ["/negocio/business-id/cafe-com-arte", "/anunciante/personal-id", "/negocios/personal-id", "/negocios/missing"]) {
      const response = await proxy(new NextRequest("http://localhost" + path));
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
    }
    for (const [path, heading] of [["/anunciante/missing", "Perfil não encontrado"], ["/negocio/missing/slug", "Página não encontrada"], ["/negocio/personal-id/slug", "Página não encontrada"]]) {
      const response = await proxy(new NextRequest("http://localhost" + path));
      expect(response.status, path).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).toContain(`<h1>${heading}</h1>`);
    }
  });
});

describe("canonical public pages", () => {
  test.each([
    ["/anuncio/ad-id", "/anuncio/ad-id/bicicleta-aro-29"],
    ["/anuncio/ad-id/titulo-antigo", "/anuncio/ad-id/bicicleta-aro-29"],
    ["/categoria/category-id", "/categoria/category-id/veiculos"],
    ["/categoria/category-id/nome-antigo", "/categoria/category-id/veiculos"],
    ["/categoria/category-id/veiculos/subcategory-id/antiga", "/categoria/category-id/veiculos/subcategory-id/motos"],
    ["/categoria/category-id/antiga/subcategory-id/motos", "/categoria/category-id/veiculos/subcategory-id/motos"],
    ["/anuncio/ad-id/bicicleta-aro-29.json", "/anuncio/ad-id/bicicleta-aro-29"],
    ["/categoria/category-id/veiculos.json", "/categoria/category-id/veiculos"],
  ])("redirects %s permanently before rendering, without letting a cache keep the redirect", async (pathname, expected) => {
    const response = await proxy(new NextRequest(`http://localhost${pathname}?utm_source=share`));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`http://localhost${expected}?utm_source=share`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test.each([
    "/anuncio/removed",
    "/anuncio/removed/slug",
    "/categoria/missing",
    "/categoria/missing/slug",
    "/categoria/category-id/veiculos/missing/slug",
    "/categoria/missing/slug/subcategory-id/motos",
  ])("answers 404 for %s before rendering", async (pathname) => {
    const response = await proxy(new NextRequest(`http://localhost${pathname}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain(pathname.startsWith("/anuncio/") ? "<h1>Anúncio não encontrado</h1>" : "<h1>Página não encontrada</h1>");
  });

  test.each([
    "/anuncio/ad-id/bicicleta-aro-29",
    "/categoria/category-id/veiculos",
    "/categoria/category-id/veiculos/subcategory-id/motos",
  ])("renders the canonical %s from a single cached lookup", async (pathname) => {
    lookup.mockClear();
    const response = await proxy(new NextRequest(`http://localhost${pathname}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(expect.anything(), { fresh: false, correlationId: expect.any(String) });
  });

  test("confirms a cached 404 or redirect with a fresh lookup", async () => {
    stale["ad:ad-id"] = { exists: true, slug: "titulo-antigo" };
    stale["ad:new-ad"] = { exists: false };
    current["ad:new-ad"] = { exists: true, slug: "recem-publicado" };
    try {
      const renamed = await proxy(new NextRequest("http://localhost/anuncio/ad-id/bicicleta-aro-29"));
      expect(renamed.headers.get("x-middleware-next")).toBe("1");
      const published = await proxy(new NextRequest("http://localhost/anuncio/new-ad/recem-publicado"));
      expect(published.headers.get("x-middleware-next")).toBe("1");
    }
    finally {
      delete stale["ad:ad-id"];
      delete stale["ad:new-ad"];
      delete current["ad:new-ad"];
    }
  });

  test.each([
    "/anuncio/unavailable",
    "/anuncio/unavailable/slug",
    "/categoria/unavailable/slug",
    "/categoria/unavailable/slug/unavailable/slug",
    "/anunciante/unavailable",
    "/negocio/unavailable/slug",
  ])("renders %s when the lookup is unavailable", async (pathname) => {
    const response = await proxy(new NextRequest(`http://localhost${pathname}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test.each([
    ["", "", ""],
    ["?adCursor=issued&adCursor=second&utm_source=share", "?adCursor=issued&adCursor=second", "#anuncios"],
  ])("sends the legacy Business alias to the advertiser page for a while when the lookup is unavailable (%s)", async (query, search, hash) => {
    const response = await proxy(new NextRequest(`http://localhost/negocios/unavailable${query}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost/anunciante/unavailable${search}${hash}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("shares the page request's validated correlation ID across both lookups", async () => {
    const edgeId = "0123456789abcdef-GRU";
    for (const headers of [{ "x-www-request-id": edgeId }, { "x-correlation-id": edgeId }]) {
      lookup.mockClear();
      await proxy(new NextRequest("http://localhost/anuncio/ad-id", { headers }));
      expect(lookup.mock.calls.map(([, options]) => options)).toEqual([{ fresh: false, correlationId: edgeId }, { fresh: true, correlationId: edgeId }]);
    }
    lookup.mockClear();
    await proxy(new NextRequest("http://localhost/anuncio/ad-id", { headers: { "x-www-request-id": "forged id" } }));
    const [[, cached], [, fresh]] = lookup.mock.calls as [unknown, { correlationId: string }][];
    expect(cached!.correlationId).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u);
    expect(fresh!.correlationId).toBe(cached!.correlationId);
  });

  test.each(["issued", "broken", ""])("delegates paginated taxonomy slug recovery to the page (%s)", async (cursor) => {
    for (const path of ["/categoria/category-id/nome-antigo", "/categoria/category-id/veiculos/subcategory-id/antiga"]) {
      const response = await proxy(new NextRequest(`http://localhost${path}?adCursor=${cursor}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  test.each([
    ["GET", "/anuncio/ad-id/editar"],
    ["GET", "/anuncio/ad-id/slug/extra"],
    ["GET", "/anuncio/%E0%A4%A"],
    ["GET", "/categoria/category-id/veiculos/subcategory-id"],
    ["POST", "/anuncio/removed/slug"],
  ])("leaves %s %s to the router", async (method, pathname) => {
    lookup.mockClear();
    const response = await proxy(new NextRequest(`http://localhost${pathname}`, { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(lookup).not.toHaveBeenCalled();
  });
});
