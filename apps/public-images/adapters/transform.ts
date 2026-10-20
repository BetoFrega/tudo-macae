import type { PublicImageTransform } from "@tudomacae/public-image-delivery/worker";

export function createCloudflareImageOrigin(fetchOrigin: typeof fetch, requestId?: string, readOrigin: typeof fetch = fetchOrigin) {
  const context = requestId ? { headers: { "x-request-id": requestId } } : {};
  const transform: PublicImageTransform = async (origin, options) => {
    const init = {
      ...context,
      redirect: "manual" as const,
      cf: {
        image: {
          anim: options.preserveAnimation,
          fit: options.resize,
          format: options.format,
          metadata: options.stripMetadata ? "none" as const : "keep" as const,
          quality: options.quality,
          width: options.width,
        },
      },
    };
    const response = await fetchOrigin(origin, init);
    return { response, failure: response.headers.has("cf-resized") ? "transformation" : "origin" };
  };
  return {
    transform,
    fetchOriginal: (origin: string) => readOrigin(origin, { ...context, redirect: "manual" }),
    checkOrigin: (origin: string) => {
      // Only cold editorial reads are guarded, against the canonical object: cache-busting never reaches the HEAD.
      const url = new URL(origin);
      url.search = "";
      return readOrigin(url, {
        ...context,
        method: "HEAD",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
    },
  };
}
