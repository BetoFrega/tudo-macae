import type { PublicImagePurgeAdapter } from "./purge";

export function createCloudflareImagePurge(configuration: {
  fetchPurge: typeof fetch;
  token: string | undefined;
  zoneId: string | undefined;
}): PublicImagePurgeAdapter {
  // A plain call: workerd rejects the global fetch invoked as a method of `configuration` (Illegal invocation).
  const send = configuration.fetchPurge;
  return {
    isConfigured: () => !!configuration.token && !!configuration.zoneId
      && /^[a-fA-F0-9]{32}$/.test(configuration.zoneId),
    async purge(target, signal) {
      const response = await send(
        `https://api.cloudflare.com/client/v4/zones/${configuration.zoneId}/purge_cache`,
        {
          method: "POST",
          signal,
          headers: {
            "Authorization": `Bearer ${configuration.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(target.layer === "worker" ? { tags: target.tags } : { files: target.files }),
        },
      );
      const result = await response.json().catch(() => null) as { success?: boolean } | null;
      return {
        success: response.ok && result?.success === true,
        cause: response.status === 401 || response.status === 403
          ? "authorization"
          : response.status === 429 ? "rate_limit" : "provider",
        retryable: response.status === 429 || response.status >= 500,
      };
    },
  };
}
