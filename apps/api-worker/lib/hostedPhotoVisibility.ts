import type { PhotoRecord } from "@tudomacae/classifieds-photos";
import { editorialCacheProbeHeader } from "@tudomacae/public-image-delivery/contract";
import { deriveEditorialCacheProbeSecret, editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "@tudomacae/public-image-delivery/probeAuthorization";
import { classifiedsImageSourceUrl } from "@tudomacae/public-image-delivery/source";

/**
 * Confirms a retired photo is gone from the Hosted origin and from every cached image Worker variant.
 * Hosted hits skip the origin read, so the edge check is the signed complete-cache probe; a GET could refill the cache.
 */
export function createHostedPhotoVisibilityVerifier(input: {
  send: typeof fetch; sendOrigin: typeof fetch; classifiedsOrigin: string; imageOrigin: string; purgeToken: string | undefined; wait(ms: number): Promise<void>;
  context: { environment: string; release: string };
}) {
  const request = async (record: PhotoRecord, target: "origin" | "edge", url: string | URL, headers?: Headers) => {
    try {
      return await (target === "origin" ? input.sendOrigin : input.send)(url, { method: "HEAD", ...(headers ? { headers } : {}), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5000) });
    }
    catch (error) {
      // The purge records only `transport`; this names the failed observation. Exception messages stay out of telemetry.
      console.error(JSON.stringify({ event: "classifieds.photos.visibility_request_failed", service: "api-worker", ...input.context, outcome: "failure",
        operationId: record.operationId, target, host: new URL(url).host, errorName: error instanceof Error ? error.name : "unknown" }));
      throw error;
    }
  };
  return async (record: PhotoRecord): Promise<boolean> => {
    const source = classifiedsImageSourceUrl(record.path, input.classifiedsOrigin);
    if (!source || !input.purgeToken) return false;
    const probeSecret = await deriveEditorialCacheProbeSecret(input.purgeToken);
    const edge = new URL(`/v1/${record.ownerKind === "ad" ? "ad/thumbnail/128" : "profile/avatar/128"}/${encodeURIComponent(record.path)}`, input.imageOrigin);
    const originAbsent = async () => [404, 410].includes((await request(record, "origin", source)).status);
    const edgeAbsent = async () => {
      const headers = new Headers({ [editorialCacheProbeHeader]: "all" });
      headers.set(editorialCacheProbeAuthorizationHeader, await signEditorialCacheProbe(new Request(edge, { method: "HEAD", headers }), probeSecret));
      const response = await request(record, "edge", edge, headers);
      return response.status === 404 && response.headers.get(editorialCacheProbeHeader) === "all";
    };
    const check = async () => await originAbsent() && await edgeAbsent();
    // A second observation catches a late fill between successful probes.
    if (!await check()) return false;
    await input.wait(1000);
    return check();
  };
}
