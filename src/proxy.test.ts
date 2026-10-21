import { describe, expect, test } from "vitest";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info";
import type { BaseNextRequest } from "next/dist/server/base-http";
import { tryToParsePath } from "next/dist/lib/try-to-parse-path";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { config } from "./proxy";
import { proxyHandles } from "./proxyScope";

// Next's own source parser and route matcher, without the optional `/_next/data`
// prefix and `.rsc` suffixes Next adds at build time: these cases name pages
// directly. `next/experimental/testing/server` loads the build toolchain, too
// large for the Workers runtime the suite also runs on.
const matchesRoute = getMiddlewareRouteMatcher(config.matcher.map((matcher): ProxyMatcher => {
  const { source, ...conditions } = typeof matcher === "string" ? { source: matcher } : matcher;
  return { ...conditions as Pick<ProxyMatcher, "has">, originalSource: source, regexp: tryToParsePath(source).regexStr! };
}));

function proxyRuns(url: string, headers: Record<string, string> = {}) {
  const { host, pathname } = new URL(url, "http://localhost");
  const request = { headers: { host, ...headers } } as unknown as BaseNextRequest;
  return matchesRoute(pathname, request, {}) && proxyHandles(pathname, new Headers({ host, ...headers }));
}

describe("MCP hostname boundary", () => {
  test("covers application HTML and the machine hostname while excluding application static assets", () => {
    expect(proxyRuns("http://localhost/noticias", { host: "mcp.tudomacae.com.br" })).toBe(true);
    expect(proxyRuns("http://localhost/noticias", { host: "www.tudomacae.com.br" })).toBe(true);
    expect(proxyRuns("http://localhost/_next/static/main.js", { host: "www.tudomacae.com.br" })).toBe(false);
  });
});

describe("authenticated document cache isolation", () => {
  test.each(["/api", "/api/navegacao-publica", "/api/autenticacao/sessao", "/sitemap.xml", "/sitemaps/anuncios.xml", "/sitemaps/anuncios/0.xml", "/robots.txt", "/site.webmanifest", "/assets/app.js", "/assets/app.css", "/assets/photo.avif"])("does not apply HTML cache policy to %s", (path) => {
    expect(proxyRuns("http://localhost" + path, { host: "www.tudomacae.com.br", cookie: "session=synthetic-session" })).toBe(false);
  });

  test("retains explicit RSC and machine-host boundaries for excluded resources", () => {
    for (const headers of [{ rsc: "1" }, { host: "mcp.tudomacae.com.br" }]) {
      expect(proxyRuns("http://localhost/api/resource", headers)).toBe(true);
    }
  });

  test("recognizes the machine host regardless of case and port", () => {
    expect(proxyRuns("http://localhost/api/resource", { host: "MCP.tudomacae.com.br:443" })).toBe(true);
  });

  test("keeps the API-like page slug within the document matcher", () => {
    expect(proxyRuns("http://localhost/api-guide", { host: "www.tudomacae.com.br" })).toBe(true);
  });
});

describe("RSC navigation rendering", () => {
  test("matches RSC navigation on sibling routes outside the existing proxy paths", () => {
    expect(proxyRuns("http://localhost/admin/categorias/category-id", { rsc: "1" })).toBe(true);
  });
});

describe("business canonical redirects", () => {
  test("matches the short plural business path", () => {
    expect(proxyRuns("http://localhost/negocios/business-id")).toBe(true);
  });
});

describe("canonical public pages", () => {
  test.each(["/anuncio/ad-id", "/anuncio/ad-id/slug", "/categoria/category-id", "/categoria/category-id/slug/subcategory-id/slug"])("routes %s through the canonical lookup", (path) => {
    expect(proxyRuns("http://localhost" + path, { host: "www.tudomacae.com.br" })).toBe(true);
  });

  test.each(["/anuncio/ad-id/slug.json", "/anuncio/ad-id.jpg", "/categoria/category-id/slug.xml", "/categoria/category-id/slug/subcategory-id/slug.png", "/anunciante/profile-id.json", "/negocios/business-id.pdf", "/negocio/business-id/slug.css"])("routes %s through the canonical lookup despite its static-looking extension", (path) => {
    expect(proxyRuns("http://localhost" + path, { host: "www.tudomacae.com.br" })).toBe(true);
  });

  test.each(["/logo.svg", "/social-preview.png", "/anuncios.json", "/categorias/slug.json"])("keeps the static asset %s out of the proxy", (path) => {
    expect(proxyRuns("http://localhost" + path, { host: "www.tudomacae.com.br" })).toBe(false);
  });
});

describe("site search release boundary", () => {
  test("routes the search page through the boundary", () => {
    expect(proxyRuns("/busca?q=padaria")).toBe(true);
  });
});
