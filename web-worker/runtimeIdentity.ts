/**
 * The diagnostics name the runtime by Cloud Run's K_SERVICE and K_REVISION. A deployed
 * Worker declares K_SERVICE in its vars; its revision is the version Cloudflare serves,
 * so a log line correlates with `CF_VERSION_METADATA`.
 */
export function workerRevision(env: Record<string, unknown>): string | undefined {
  const service = env.K_SERVICE;
  const metadata = env.CF_VERSION_METADATA;
  const version = metadata && typeof metadata === "object" && "id" in metadata ? metadata.id : undefined;
  return typeof service === "string" && service && typeof version === "string" && version
    ? `${service}-${version}`
    : undefined;
}
