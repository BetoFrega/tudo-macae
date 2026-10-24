import { NextResponse, type NextRequest } from "next/server";
import type { CanonicalLookup } from "@tudomacae/classifieds-client/canonical";
import { edgeRequestIdHeader, requestCorrelationId, requestCorrelationIdHeader } from "@tudomacae/www-origin-routing/contract";
import { canonicalPageResponse, type NotFoundCopy } from "./proxyCanonicalPages";
import { isMcpHost } from "./proxyScope";

/**
 * Loader for the canonical page lookup. Production imports it on demand, so
 * other routes never load the API Worker client; tests pass an in-memory replacement.
 */
export interface ProxyDependencies {
  canonicalLookup: () => Promise<CanonicalLookup>;
}

const genericNotFound: NotFoundCopy = { heading: "Página não encontrada", message: "A página que você está procurando não existe." };

function notFoundPage({ heading, message }: NotFoundCopy) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${heading} | Tudo Macaé</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>${heading}</h1>
<p>${message}</p>
<p><a href="/">Ir para a página inicial do Tudo Macaé</a></p>
</body>
</html>`;
}

/** The copy is fixed text from this module or the canonical page rules, never request input. */
function notFoundResponse(copy: NotFoundCopy = genericNotFound): Response {
  return new Response(notFoundPage(copy), {
    status: 404,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/html; charset=utf-8",
      // The page links home; the requested URL, such as a search with `q`, must not travel as Referer.
      "referrer-policy": "origin",
    },
  });
}

function mcpNotFound(): Response {
  return Response.json(
    { error: "Rota não encontrada." },
    {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

function userAgentPolicy(request: NextRequest) {
  // Next skips htmlLimitedBots when the User-Agent is empty. A neutral value
  // keeps metadata blocking without classifying the whole document as a bot.
  const articleDocument = /^\/noticia\/[^/]+\/(?!midias(?:\/|$))[^/]+\/?$/u
    .test(request.nextUrl.pathname);
  // HTML readers need blocking metadata; RSC navigation needs PPR shells.
  // Applying the HTML bot policy to RSC prefetches can cache a concrete sibling
  // page under a shared shell key. Session and router headers stay intact.
  const componentRequest = request.method === "GET" && request.headers.get("rsc") === "1";
  const missingUserAgent = !request.headers.get("user-agent")?.trim();
  const normalizeUserAgent = articleDocument && !componentRequest && missingUserAgent && ["GET", "HEAD"].includes(request.method);
  return { componentRequest, normalizeUserAgent };
}

function forwardedResponse(request: NextRequest, home: boolean): NextResponse {
  const { componentRequest, normalizeUserAgent } = userAgentPolicy(request);
  const headers = new Headers(request.headers);
  if (componentRequest) headers.delete("user-agent");
  if (normalizeUserAgent) {
    headers.set("user-agent", "UnknownPreviewClient");
  }
  return home || normalizeUserAgent || componentRequest
    ? NextResponse.next({ request: { headers } })
    : NextResponse.next();
}

export function createProxy(dependencies: ProxyDependencies) {
  return async function proxy(request: NextRequest): Promise<Response> {
    if (isMcpHost(request.headers.get("host") ?? request.nextUrl.hostname)) return mcpNotFound();

    // The same root the request-error log records, so a Worker failure joins the page request.
    const correlationId = requestCorrelationId(request.headers.get(edgeRequestIdHeader)) ?? requestCorrelationId(request.headers.get(requestCorrelationIdHeader));
    const canonical = await canonicalPageResponse(request, dependencies.canonicalLookup, notFoundResponse, correlationId);
    if (canonical) return canonical;
    const home = request.nextUrl.pathname === "/";
    const response = forwardedResponse(request, home);
    if (home || request.cookies.has("session")) {
      response.headers.set("cache-control", home ? "private, no-store, max-age=0, must-revalidate" : "private, no-store");
      response.headers.set("cdn-cache-control", "no-store");
    }
    return response;
  };
}
