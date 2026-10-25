import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { createProxy } from "./proxyHandler";

const canonicalLookup = vi.fn(() => Promise.resolve(async () => undefined));

const proxy = createProxy({ canonicalLookup });

function machineRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: { host: "mcp.tudomacae.com.br" },
  });
}

describe("MCP hostname boundary", () => {
  test("returns an uncached 404 for all retired machine resources", async () => {
    const accepted = await proxy(machineRequest("/mcp"));
    const http = await proxy(machineRequest("/tools/v1"));
    const sessions = await proxy(machineRequest("/sessions/v1"));
    const rejected = await proxy(machineRequest("/noticias"));
    const rejectedBusiness = await proxy(machineRequest("/negocios/business-id"));
    const rejectedSessionNews = await proxy(new NextRequest(
      "http://localhost/noticia/private",
      {
        headers: {
          cookie: "session=active",
          host: "mcp.tudomacae.com.br",
        },
      },
    ));
    const retired = await proxy(machineRequest("/editorial/v1"));
    expect(http.status).toBe(404);
    expect(http.headers.get("cache-control")).toBe("no-store");
    expect(sessions.status).toBe(404);
    expect(sessions.headers.get("cache-control")).toBe("no-store");

    expect(accepted.status).toBe(404);
    expect(accepted.headers.get("cache-control")).toBe("no-store");
    expect(rejected.status).toBe(404);
    expect(rejectedBusiness.status).toBe(404);
    expect(rejectedSessionNews.status).toBe(404);
    expect(retired.status).toBe(404);
    expect(rejectedBusiness.headers.get("cache-control")).toBe("no-store");
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    expect(rejected.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(rejected.json()).resolves.toEqual({
      error: "Rota não encontrada.",
    });
  });

  test("does not narrow the canonical application hostname", async () => {
    const response = await proxy(new NextRequest(
      "http://localhost/noticias",
      { headers: { host: "www.tudomacae.com.br" } },
    ));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("authenticated document cache isolation", () => {
  test.each(["/noticias", "/publicar", "/minha-conta/anuncios", "/redacao"])("keeps visitor-dependent HTML private on %s", async (path) => {
    canonicalLookup.mockClear();
    for (const cookie of ["session=synthetic-session"]) {
      const response = await proxy(new NextRequest("http://localhost" + path, { headers: { cookie } }));
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    }
    const anonymous = await proxy(new NextRequest("http://localhost" + path));
    expect(anonymous.headers.has("cache-control")).toBe(false);
    expect(anonymous.headers.has("cdn-cache-control")).toBe(false);
    // Pages outside the canonical lookup never load the API Worker client.
    expect(canonicalLookup).not.toHaveBeenCalled();
  });
});

describe("RSC navigation rendering", () => {
  test("keeps component requests out of the HTML metadata bot policy without dropping session or router headers", async () => {
    const response = await proxy(new NextRequest("http://localhost/admin/categorias/category-id", {
      headers: { "user-agent": "Mozilla/5.0", "rsc": "1", "cookie": "session=test-session", "next-router-prefetch": "1" },
    }));
    expect(response.headers.get("x-middleware-request-user-agent")).toBeNull();
    expect(response.headers.get("x-middleware-override-headers")?.split(",") ?? []).not.toContain("user-agent");
    expect(response.headers.get("x-middleware-request-rsc")).toBe("1");
    expect(response.headers.get("x-middleware-request-cookie")).toBe("session=test-session");
    expect(response.headers.get("x-middleware-request-next-router-prefetch")).toBe("1");
  });

  test("does not restore the HTML reader identity on RSC article requests without a User-Agent", async () => {
    const response = await proxy(new NextRequest("http://localhost/noticia/id/article", {
      headers: { rsc: "1", cookie: "session=test-session" },
    }));
    expect(response.headers.get("x-middleware-request-user-agent")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("preserves Server Action request headers", async () => {
    const response = await proxy(new NextRequest("http://localhost/noticia/id/article", {
      method: "POST", headers: { "user-agent": "Mozilla/5.0", "rsc": "1", "next-action": "action-id" },
    }));
    expect(response.headers.has("x-middleware-override-headers")).toBe(false);
  });
});

describe("site search", () => {
  test("forwards every visitor to the search page", async () => {
    const response = await proxy(new NextRequest("http://localhost/busca?q=padaria"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("not found pages", () => {
  test("answers not found itself, without a rewrite the origin could proxy or a Referer carrying the request", async () => {
    // Behind Cloud Run the proxy sees another origin than the router, so a rewrite
    // would be proxied externally and fail; the response must not depend on it.
    // An id longer than any Profile id is answered without a lookup.
    const response = await proxy(new NextRequest(`https://localhost:8081/anunciante/${"x".repeat(213)}?q=padaria`, {
      headers: { "x-forwarded-proto": "https" },
    }));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("referrer-policy")).toBe("origin");
    expect(response.headers.has("x-middleware-rewrite")).toBe(false);
    const body = await response.text();
    expect(body).toContain("<html lang=\"pt-BR\">");
    expect(body).toContain("<a href=\"/\">");
    expect(body).not.toContain("padaria");
  });
});

describe("article metadata request transport", () => {
  test.each([undefined, "", "   "])("normalizes a missing or blank User-Agent (%s) only upstream", async (userAgent) => {
    const headers = new Headers({ cookie: "session=active", accept: "text/html" });
    if (userAgent !== undefined) headers.set("user-agent", userAgent);
    const response = await proxy(new NextRequest("http://localhost/noticia/id/article", { headers }));
    expect(response.headers.get("x-middleware-request-user-agent")).toBe("UnknownPreviewClient");
    expect(response.headers.get("x-middleware-request-cookie")).toBe("session=active");
    expect(response.headers.get("x-middleware-request-accept")).toBe("text/html");
    expect(response.headers.has("user-agent")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("covers HEAD while leaving existing identities unchanged", async () => {
    const head = await proxy(new NextRequest("http://localhost/noticia/id/article", { method: "HEAD" }));
    expect(head.headers.get("x-middleware-request-user-agent")).toBe("UnknownPreviewClient");
    for (const userAgent of ["Mozilla/5.0", "WhatsApp/2.24.7.81 A", "Facebot"]) {
      const response = await proxy(new NextRequest("http://localhost/noticia/id/article", {
        headers: { "user-agent": userAgent },
      }));
      expect(response.headers.has("x-middleware-override-headers")).toBe(false);
    }
  });

  test.each([
    ["GET", "/noticia/id/midias/media"],
    ["GET", "/noticia/id/midias"],
    ["GET", "/noticia/id"],
    ["GET", "/mcp"],
    ["POST", "/noticia/id/article"],
  ])("leaves %s %s unchanged", async (method, pathname) => {
    const response = await proxy(new NextRequest(`http://localhost${pathname}`, { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("x-middleware-override-headers")).toBe(false);
  });
});
