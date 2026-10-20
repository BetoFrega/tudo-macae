import { chosenOriginHeader, edgeRequestIdHeader, requestCorrelationIdHeader, workerVersionHeader } from "../contract";
import { READ_METHODS, statusClass } from "./requests";

import type { RouteContext, RouterSetup } from "./requests";

function webWorkerRequest(context: RouteContext) {
  const headers = new Headers(context.request.headers);
  headers.set(edgeRequestIdHeader, context.requestId);
  headers.set(requestCorrelationIdHeader, context.requestId);
  return new Request(context.request, { headers });
}

function termsWorkerHeaders(upstream: Response, context: RouteContext) {
  const headers = new Headers(upstream.headers);
  headers.set(chosenOriginHeader, "terms-workers");
  headers.set(requestCorrelationIdHeader, context.requestId);
  return headers;
}

export function termsWorkerVersionField(headers: Headers) {
  const termsWorkerVersion = headers.get(workerVersionHeader);
  return termsWorkerVersion && /^[a-f0-9-]{8,64}$/u.test(termsWorkerVersion) ? { termsWorkerVersion } : {};
}

function withHeaders(upstream: Response, headers: Headers) {
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

function unavailable(context: RouteContext) {
  return new Response(null, {
    status: 502,
    headers: { "cache-control": "no-store", [chosenOriginHeader]: "terms-workers", [requestCorrelationIdHeader]: context.requestId },
  });
}

/**
 * A versioned asset the release no longer holds answers 502 instead of the
 * application's 404, so a browser never caches the miss under that path.
 */
export async function serveWebAsset(setup: RouterSetup, context: RouteContext) {
  const { requestId } = context;
  try {
    const asset = await setup.dependencies.fetchWebWorker(webWorkerRequest(context));
    if (asset.status >= 400) throw new Error("Web asset unavailable");
    const headers = termsWorkerHeaders(asset, context);
    setup.dependencies.log({ outcome: "success", requestClass: "asset", selectedOrigin: "terms-workers", statusClass: statusClass(asset.status), ...termsWorkerVersionField(headers), requestId });
    return withHeaders(asset, headers);
  }
  catch {
    setup.dependencies.log({ failure: "terms-worker-unavailable", outcome: "failure", requestClass: "asset", selectedOrigin: "terms-workers", statusClass: "5xx", requestId });
    return unavailable(context);
  }
}

/**
 * The application's answer with its own `Cache-Control` (ADR 0017); public
 * files come from its asset layer without the version stamp. A transport
 * failure answers 502 and is never retried, so a write it may have run is
 * marked uncertain.
 */
export async function serveWeb(setup: RouterSetup, context: RouteContext) {
  const { requestId } = context;
  try {
    const result = await setup.dependencies.fetchWebWorker(webWorkerRequest(context));
    const headers = termsWorkerHeaders(result, context);
    const failed = result.status >= 500;
    setup.dependencies.log({
      ...(failed ? { failure: "terms-worker-unavailable" as const, outcome: "failure" as const } : { outcome: "success" as const }),
      requestClass: context.kind, selectedOrigin: "terms-workers", statusClass: statusClass(result.status), ...termsWorkerVersionField(headers), requestId,
    });
    return withHeaders(result, headers);
  }
  catch {
    const write = !READ_METHODS.has(context.request.method);
    setup.dependencies.log({ failure: "terms-worker-unavailable", outcome: "failure", requestClass: context.kind, selectedOrigin: "terms-workers", statusClass: "5xx", ...(write ? { uncertainWrite: true as const } : {}), requestId });
    return unavailable(context);
  }
}
