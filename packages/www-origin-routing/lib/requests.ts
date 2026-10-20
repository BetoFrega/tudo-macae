import { mcpHostname, vinextActionHeader } from "../contract";
import { webAssetPrefix } from "../webAssets";

import type { RequestClass, WwwOriginRouterDependencies } from "./types";

export const READ_METHODS = new Set(["GET", "HEAD"]);

/** Router-wide settings shared by every request. */
export interface RouterSetup {
  dependencies: WwwOriginRouterDependencies;
}

/** Facts about one incoming request, derived once before routing. */
export interface RouteContext {
  request: Request;
  incoming: URL;
  kind: RequestClass;
  requestId: string;
}

function isServerAction(request: Request) {
  return request.method === "POST" && (request.headers.has("next-action") || request.headers.has(vinextActionHeader));
}

export function requestClass(request: Request, url: URL): RequestClass {
  if (url.hostname === mcpHostname) return "editorial";
  if (isServerAction(request)) return "action";
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith(`${webAssetPrefix}/`)) return "asset";
  if (request.headers.get("rsc") === "1") return "rsc";
  const html = READ_METHODS.has(request.method) && (request.headers.get("accept") ?? "").includes("text/html");
  return html ? "document" : "other";
}

export function statusClass(status: number) {
  return `${Math.floor(status / 100)}xx`;
}
