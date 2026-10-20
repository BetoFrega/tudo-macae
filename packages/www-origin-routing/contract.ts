/**
 * Facts shared by the `www` edge Worker and the applications behind it. Both sides
 * import them, so a rename cannot leave one side checking a stale name.
 */

export const wwwHostname = "www.tudomacae.com.br";
export const mcpHostname = "mcp.tudomacae.com.br";

/** Edge request id (Cloudflare ray) carried to the origin so both logs join. */
export const edgeRequestIdHeader = "x-www-request-id";

/** Origin that served the response, exposed for verification. */
export const chosenOriginHeader = "x-www-origin";

/** Web Worker version that rendered a response; its presence also marks the application's own answer. */
export const workerVersionHeader = "x-terms-worker-version";

/** vinext's client sends this with every Server Action; Next's client never does. */
export const vinextActionHeader = "x-rsc-action";

export const isEdgeRequestId = (value: string) => /^[a-f0-9]{16}(?:-[A-Z]{3})?$/u.test(value);

/** Stable root identifier passed from the first infrastructure boundary to downstream calls. */
export const requestCorrelationIdHeader = "x-correlation-id";
export function requestCorrelationId(value: string | null | undefined) {
  return value && (isEdgeRequestId(value) || /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu.test(value)) ? value : undefined;
}
