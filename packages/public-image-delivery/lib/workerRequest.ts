import { editorialImageSourceUrl } from "../editorial";
import {
  negotiatedImageFormat,
  publicImagePrefixes,
  publicImagePresetWidths,
  PublicImageClass,
  PublicImagePreset,
} from "../contract";
import type {
  InvalidPublicImageRequestLogEvent,
  ParsedImageRequest,
  PublicImageRouteTemplate,
  PublicImageWorkerConfiguration,
} from "./workerTypes";

const allowedWidths: Record<
  PublicImageClass,
  Partial<Record<PublicImagePreset, readonly number[]>>
> = publicImagePresetWidths;

function isAllowedRequestUrl(request: Request, url: URL, configuration: PublicImageWorkerConfiguration): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (url.protocol !== "https:" || url.host !== configuration.publicHost) return false;
  return !url.username && !url.password && !url.search && !url.hash;
}

function parseRoute(pathname: string) {
  const match = /^\/v1\/(remaining\/)?(ad|profile|editorial)\/([a-z]+)\/(\d+)\/(.+)$/.exec(pathname);
  if (!match) return null;
  const remaining = !!match[1];
  const imageClass = match[2] as PublicImageClass;
  const preset = match[3] as PublicImagePreset;
  const width = Number(match[4]);
  if (!allowedWidths[imageClass][preset]?.includes(width)) return null;
  if (remaining && (imageClass !== "profile" || preset !== "avatar")) return null;
  return { remaining, imageClass, preset, width, encodedKey: match[5] };
}

function decodedKey(encodedKey: string): string | null {
  try {
    return decodeURIComponent(encodedKey);
  }
  catch {
    return null;
  }
}

function isSafeKey(key: string, imageClass: PublicImageClass): boolean {
  return key.startsWith(publicImagePrefixes[imageClass])
    && /^[A-Za-z0-9._/-]+$/.test(key)
    && key.split("/").every(segment => segment && segment !== "." && segment !== "..");
}

export function parseRequest(
  request: Request,
  configuration: PublicImageWorkerConfiguration,
): ParsedImageRequest | null {
  const url = new URL(request.url);
  if (!isAllowedRequestUrl(request, url, configuration)) return null;
  const route = parseRoute(url.pathname);
  if (!route) return null;
  const key = decodedKey(route.encodedKey);
  if (key === null || !isSafeKey(key, route.imageClass)) return null;
  if (route.imageClass === "editorial" && !editorialImageSourceUrl(key, configuration.editorialOrigin ?? "")) return null;

  return {
    remaining: route.remaining,
    imageClass: route.imageClass,
    preset: route.preset,
    width: route.width,
    key,
    format: negotiatedImageFormat(request.headers.get("accept")),
  };
}

export function publicImageRouteTemplate(pathname: string): PublicImageRouteTemplate | undefined {
  const match = /^\/v1\/(remaining\/)?[^/]+\/[^/]+\/[^/]+\/.+$/.exec(pathname);
  if (!match) return undefined;
  return match[1]
    ? "/v1/remaining/:class/:preset/:width/:key"
    : "/v1/:class/:preset/:width/:key";
}

export function invalidPublicImageRequestEvent(routeTemplate: PublicImageRouteTemplate): InvalidPublicImageRequestLogEvent {
  return {
    cache: "uninspected",
    reason: "invalid_public_image_request",
    result: "rejected",
    routeTemplate,
    status: 400,
  };
}
