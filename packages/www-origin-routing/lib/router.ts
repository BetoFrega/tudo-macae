import { chosenOriginHeader, isEdgeRequestId, mcpHostname, wwwHostname } from "../contract";
import { webAssetPrefix } from "../webAssets";
import { cachedResponse, edgeCacheKey, isEdgeCached, isEdgeStorable, storedResponse } from "./edgeCache";
import { READ_METHODS, requestClass, statusClass } from "./requests";
import { serveWeb, serveWebAsset, termsWorkerVersionField } from "./webWorker";

import type { RouteContext, RouterSetup } from "./requests";
import type { BackgroundWork, WwwOriginRouterDependencies } from "./types";

const notFound = (headers: Record<string, string> = {}) =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store", ...headers } });

function routeContext(request: Request, incoming: URL): RouteContext {
  const ray = request.headers.get("cf-ray");
  return {
    request,
    incoming,
    kind: requestClass(request, incoming),
    requestId: ray && isEdgeRequestId(ray) ? ray : crypto.randomUUID(),
  };
}

/**
 * The machine host's MCP, tools and session resources are retired
 * (docs/agents/mcp-edge-runbook.md); the edge answers them without an origin.
 */
function retiredMachineHost(setup: RouterSetup, context: RouteContext) {
  setup.dependencies.log({ outcome: "success", requestClass: "editorial", requestId: context.requestId, statusClass: "4xx" });
  return notFound({ [chosenOriginHeader]: "edge" });
}

function isWebAssetRead({ request, incoming }: RouteContext) {
  return READ_METHODS.has(request.method)
    && (incoming.pathname === webAssetPrefix || incoming.pathname.startsWith(`${webAssetPrefix}/`));
}

/** Logged apart from the request outcome, so a cold cache stays distinguishable from a broken one. */
function logEdgeCacheFailure(setup: RouterSetup, context: RouteContext, edgeCache: "read-failed" | "write-failed", status: number) {
  setup.dependencies.log({ edgeCache, outcome: "success", requestClass: context.kind, requestId: context.requestId, statusClass: statusClass(status) });
}

/** A cache failure must not replace the response; the read then reaches the application. */
async function readEdgeCache(setup: RouterSetup, context: RouteContext, key: Request) {
  const cache = setup.dependencies.edgeCache;
  if (!cache) return {};
  try {
    const cached = await cache.match(key);
    if (!cached) return {};
    setup.dependencies.log({
      edgeCache: "hit",
      outcome: "success",
      requestClass: context.kind,
      requestId: context.requestId,
      ...termsWorkerVersionField(cached.headers),
      selectedOrigin: "terms-workers",
      statusClass: statusClass(cached.status),
    });
    return { response: cachedResponse(cached, context) };
  }
  catch {
    return { failed: true };
  }
}

function writeEdgeCache(setup: RouterSetup, context: RouteContext, key: Request, response: Response, background: BackgroundWork | undefined) {
  const cache = setup.dependencies.edgeCache;
  if (!cache || !isEdgeStorable(response)) return response;
  const write = cache.put(key, storedResponse(response.clone()))
    .catch(() => logEdgeCacheFailure(setup, context, "write-failed", response.status));
  background?.waitUntil(write);
  return response;
}

async function serveCached(setup: RouterSetup, context: RouteContext, background: BackgroundWork | undefined) {
  const key = edgeCacheKey(context);
  const cached = await readEdgeCache(setup, context, key);
  if (cached.response) return cached.response;
  const served = await serveWeb(setup, context);
  if (cached.failed) logEdgeCacheFailure(setup, context, "read-failed", served.status);
  return writeEdgeCache(setup, context, key, served, background);
}

/**
 * Serves `www` from the Web Worker through its service binding. Nothing here
 * renders per visitor.
 */
export function createWwwOriginRouter(dependencies: WwwOriginRouterDependencies) {
  const setup: RouterSetup = { dependencies };
  return {
    async fetch(request: Request, background?: BackgroundWork) {
      const incoming = new URL(request.url);
      const context = routeContext(request, incoming);
      if (incoming.hostname === mcpHostname) return retiredMachineHost(setup, context);
      if (incoming.hostname !== wwwHostname) return notFound();
      if (isWebAssetRead(context)) return serveWebAsset(setup, context);
      if (isEdgeCached(context)) return serveCached(setup, context, background);
      return serveWeb(setup, context);
    },
  };
}
