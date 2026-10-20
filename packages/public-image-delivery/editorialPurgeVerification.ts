import { editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "./probeAuthorization";
import { editorialCacheProbeHeader, editorialCacheVariantHeader, publicImagePresetWidths } from "./contract";
import { parseEditorialImageKey, editorialImageSourceUrl } from "./editorial";
import type { PurgeVerificationFailure } from "./purge";

const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function probeRequestHeaders(url: string, baseHeaders: Record<string, string>, completeCache: boolean, probeSecret: string | undefined) {
  const probeHeaders = new Headers({ ...baseHeaders, ...(completeCache ? { [editorialCacheProbeHeader]: "all" } : {}) });
  if (completeCache) probeHeaders.set(editorialCacheProbeAuthorizationHeader,
    await signEditorialCacheProbe(new Request(url, { method: "HEAD", headers: probeHeaders }), probeSecret!));
  return probeHeaders;
}

function isPurged(response: Response, completeCache: boolean): boolean {
  return response.status === 404 && (!completeCache || response.headers.get(editorialCacheProbeHeader) === "all");
}

function safeResponseId(response: Response, requestId: string): string {
  const responseId = response.headers.get("x-request-id");
  return responseId && requestIdPattern.test(responseId) ? responseId : requestId;
}

function statusClass(status: number): PurgeVerificationFailure["statusClass"] {
  return status >= 100 && status < 600 ? `${Math.floor(status / 100)}xx` as PurgeVerificationFailure["statusClass"] : "none";
}

function residentVariant(response: Response, completeCache: boolean) {
  if (!completeCache) return {};
  const resident = response.headers.get(editorialCacheVariantHeader)?.match(/^(\d+)\/(avif|webp|jpeg)$/);
  if (!resident) return {};
  const width = Number(resident[1]);
  if (!publicImagePresetWidths.editorial.hero.some(allowed => allowed === width)) return {};
  return { width, format: resident[2] as "avif" | "webp" | "jpeg" };
}

export function createEditorialPurgeVerifier(fetchProbe: typeof fetch, options: {
  probeSecret?: string | undefined;
  /** The environment's site and images hosts; a probe of another environment's hosts proves nothing here. */
  origins?: { editorial: string; images: string };
  failed?(failure: PurgeVerificationFailure): void;
} = {}) {
  const origins = options.origins ?? { editorial: "https://www.tudomacae.com.br", images: "https://images.tudomacae.com.br" };
  const requestId = crypto.randomUUID();
  const headers = { "x-request-id": requestId };
  return async (keys: readonly string[]): Promise<boolean> => {
    // Scale the observation budget with retirement size while bounding the mutation.
    const deadline = AbortSignal.timeout(Math.min(30000, Math.max(1, keys.length) * 5000));
    async function probe(url: string, boundary: PurgeVerificationFailure["boundary"], completeCache: boolean = false) {
      if (completeCache && !options.probeSecret) return false;
      let response: Response;
      try {
        response = await fetchProbe(url, {
          method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.any([deadline, AbortSignal.timeout(2000)]),
          headers: await probeRequestHeaders(url, headers, completeCache, options.probeSecret),
        });
      }
      catch {
        options.failed?.({ requestId, boundary, outcome: "transport", statusClass: "none" });
        return false;
      }
      if (isPurged(response, completeCache)) return true;
      options.failed?.({
        requestId: safeResponseId(response, requestId), boundary, outcome: "response",
        statusClass: statusClass(response.status), ...residentVariant(response, completeCache),
      });
      return false;
    }
    if (keys.some(key => !parseEditorialImageKey(key))) return false;
    // Each key needs origin denial plus one complete local cache inspection.
    for (let offset = 0; offset < keys.length; offset += 5) {
      const results = await Promise.all(keys.slice(offset, offset + 5).map(async (key) => {
        if (!await probe(editorialImageSourceUrl(key, origins.editorial)!, "origin")) return false;
        return probe(new URL(`/v1/editorial/hero/750/${encodeURIComponent(key)}`, origins.images).href, "worker", true);
      }));
      if (!results.every(Boolean)) return false;
    }
    return true;
  };
}
