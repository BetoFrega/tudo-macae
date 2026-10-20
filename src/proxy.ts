import { NextResponse, type NextRequest } from "next/server";
import { createProxy } from "./proxyHandler";
import { proxyHandles } from "./proxyScope";

const handle = createProxy({
  canonicalLookup: () => import("@/packages/classifieds-api/canonical").then(module => module.canonicalLookup),
  siteSearch: () => import("@/integrations/site-search/production"),
});

export function proxy(request: NextRequest): Promise<Response> {
  if (!proxyHandles(request.nextUrl.pathname, request.headers)) return Promise.resolve(NextResponse.next());
  return handle(request);
}

export const config = {
  matcher: [
    "/",
    "/busca",
    "/noticia/:path*",
    // Public entity pages take any last segment, including one that ends like a static
    // file extension, so the canonical lookup still answers 404 or 308 for it.
    // No public asset or route handler lives under these prefixes.
    "/anuncio/:path*",
    "/categoria/:path*",
    "/anunciante/:path*",
    "/negocios/:path*",
    "/negocio/:path*",
    "/:path*",
  ],
};
