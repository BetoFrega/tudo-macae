import { edgeRequestIdHeader, requestCorrelationId, requestCorrelationIdHeader } from "@tudomacae/www-origin-routing/contract";
import { authenticationNetworkHeaders } from "./clientNetwork";
import { readBoundedJson } from "@/lib/sameOriginMutation";
import { configuredAuthenticationClient } from "@tudomacae/authentication-client/server";

function emptyResponse(status: number) {
  return new Response(null, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function requestIdOf(request: Request) {
  const suppliedId = request.headers.get("x-request-id");
  return suppliedId && /^[a-f\d-]{36}$/i.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
}

function isAllowedOrigin(request: Request, url: URL) {
  if (request.method === "GET") return true;
  const origin = request.headers.get("origin");
  return origin === url.origin || origin === process.env.PUBLIC_APP_ORIGIN;
}

async function forwardedHeaders(request: Request, requestId: string, correlationId: string) {
  const headers = await authenticationNetworkHeaders(request.headers);
  headers.set("x-request-id", requestId);
  headers.set(requestCorrelationIdHeader, correlationId);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

function proxiedResponse(response: Response) {
  const responseHeaders = new Headers(response.headers);
  // Fetch decodes the upstream body; its wire encoding and length no longer apply.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function forwardAuthenticationRequest(request: Request, requestId: string, correlationId: string) {
  const url = new URL(request.url);
  if (!isAllowedOrigin(request, url)) return emptyResponse(403);
  const headers = await forwardedHeaders(request, requestId, correlationId);
  const body
    = request.method === "GET" ? undefined : await readBoundedJson(request);
  if (body === null) return emptyResponse(400);
  const response = await configuredAuthenticationClient().request(
    url.pathname + url.search,
    {
      headers,
      method: request.method,
      forwardUnavailable: true,
      ...(body === undefined ? {} : { body }),
    },
  );
  return proxiedResponse(response);
}

function reportProxyFailure(request: Request, error: unknown, requestId: string, correlationId: string) {
  console.error(JSON.stringify({
    event: "authentication.proxy.failed",
    service: process.env.K_SERVICE ?? "next",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome: "failed",
    failureCategory: error instanceof TypeError ? "type_error" : "dependency_or_runtime",
    route: new URL(request.url).pathname.startsWith("/api/trpc/") ? "/api/trpc/:procedure" : "/api/auth/:operation",
    requestId, correlationId,
    statusClass: "5xx",
  }));
}

export async function proxyAuthenticationRequest(request: Request) {
  const requestId = requestIdOf(request);
  const correlationId = requestCorrelationId(request.headers.get(edgeRequestIdHeader)) ?? requestId;
  try {
    return await forwardAuthenticationRequest(request, requestId, correlationId);
  }
  catch (error) {
    reportProxyFailure(request, error, requestId, correlationId);
    return Response.json(
      { error: "Não foi possível acessar sua conta. Tente novamente." },
      { status: 503, headers: { "cache-control": "private, no-store", "x-request-id": requestId, [requestCorrelationIdHeader]: correlationId, "x-auth-error-reported": "1" } },
    );
  }
}
