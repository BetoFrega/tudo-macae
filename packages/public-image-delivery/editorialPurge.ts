import { createCloudflareImagePurge } from "./cloudflarePurge";
import { createEditorialPurgeVerifier } from "./editorialPurgeVerification";
import { deriveEditorialCacheProbeSecret } from "./probeAuthorization";
import { createPublicImagePurger, type PurgeFailureCause, type PurgeVerificationFailure } from "./purge";
import { createVerifiedPublicImagePurger } from "./verifiedPurge";

export type EditorialImagePurge = (keys: string[]) => Promise<{ success: boolean; cause?: PurgeFailureCause; verification?: PurgeVerificationFailure }>;

/**
 * Purges retired editorial images and verifies their absence at the origin and in the images Worker cache.
 * Missing credentials fail as `configuration`, so the caller keeps the retirement pending.
 */
export function createEditorialImagePurge(configuration: {
  send: typeof fetch;
  token: string | undefined;
  zoneId: string | undefined;
  /** The environment's site and images hosts: the purge targets and the verifier probes only these. */
  origins: { editorial: string; images: string };
}): EditorialImagePurge {
  const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
  // A plain call: workerd rejects the global fetch invoked as a method of `configuration` (Illegal invocation).
  const send = configuration.send;
  return async (keys) => {
    const purger = createPublicImagePurger({
      adapter: createCloudflareImagePurge({ fetchPurge: send, token: configuration.token, zoneId: configuration.zoneId }),
      editorialOrigin: configuration.origins.editorial,
      wait,
    });
    let verification: PurgeVerificationFailure | undefined;
    const probeSecret = configuration.token ? await deriveEditorialCacheProbeSecret(configuration.token) : undefined;
    const result = await createVerifiedPublicImagePurger({
      purgeMany: purger.purgeMany, wait,
      verifyAbsent: createEditorialPurgeVerifier((input, init) => send(input, init), { probeSecret, origins: configuration.origins, failed: (failure) => { verification = failure; } }),
    }).purgeMany(keys);
    return { success: result.success, ...(result.failures[0] ? { cause: result.failures[0].cause } : {}),
      ...(result.failures[0]?.cause === "verification" && verification ? { verification } : {}) };
  };
}
