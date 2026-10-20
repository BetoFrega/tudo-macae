import type {
  ParsedImageRequest,
  PublicImageWorkerDependencies,
} from "./workerTypes";

const unavailableResults: Record<number, { result: "gone" | "not_found"; body: string }> = {
  404: { result: "not_found", body: "Public image not found" },
  410: { result: "gone", body: "Public image gone" },
};
const rejectedResult = { result: "rejected", body: "Public image origin unavailable" } as const;

/** The origin's 404 and 410 pass through; every other unavailable status becomes a 502 `origin` failure. */
export function unavailableImageResponse(
  dependencies: PublicImageWorkerDependencies,
  request: Request, parsed: ParsedImageRequest,
  originStatus: number,
  cache: "hit" | "miss",
): Response {
  const status = originStatus === 404 || originStatus === 410 ? originStatus : 502;
  const { result, body } = unavailableResults[status] ?? rejectedResult;
  dependencies.log({
    cache, failure: status === 502 ? "origin" : undefined,
    imageClass: parsed.imageClass, preset: parsed.preset, result, status,
  });
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: { "cache-control": "no-store", "x-image-cache": cache, "x-image-result": result },
  });
}
