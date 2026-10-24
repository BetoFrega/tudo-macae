import type { SiteSearchChunk, SiteSearchProvider, SiteSearchProviderReply } from "./siteSearch";

type Fetch = typeof globalThis.fetch;

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
// Workers reject `redirect: "error"`; with "manual" a redirect fails the `ok` checks instead of being followed.
const redirect = "manual";

/**
 * HTTPS in every deployed runtime. A loopback origin is a local provider the
 * machine itself serves; it cannot answer from Cloud Run, and it carries no
 * runtime identity because Google cannot mint one for it.
 */
function endpoint(origin: string | undefined, path: string) {
  if (!origin) return undefined;
  let url: URL;
  try {
    url = new URL(path, origin);
  }
  catch {
    return undefined;
  }
  const loopback = url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (url.protocol !== "https:" && !loopback) return undefined;
  return { url, loopback };
}

function isChunk(value: unknown): value is SiteSearchChunk {
  if (typeof value !== "object" || value === null) return false;
  const chunk = value as Record<string, unknown>;
  return typeof chunk.key === "string"
    && typeof chunk.text === "string"
    && (chunk.title === undefined || typeof chunk.title === "string");
}

function requestHeaders(correlationId: string | undefined) {
  const headers = new Headers({ "content-type": "application/json" });
  if (correlationId) headers.set("x-request-id", correlationId);
  return headers;
}

/** Rejects with the deadline's reason once it aborts; never rejects unobserved. */
function deadlineExpiry(signal: AbortSignal) {
  const expired = new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  expired.catch(() => {});
  return expired;
}

function isTimeout(error: unknown) {
  return error instanceof DOMException && error.name === "TimeoutError";
}

function providerDuration(durationMs: unknown) {
  return typeof durationMs === "number" && Number.isFinite(durationMs)
    ? { providerDurationMs: durationMs }
    : {};
}

async function replyFromResponse(response: Response): Promise<SiteSearchProviderReply> {
  if (response.status === 429) return { status: "quota" };
  if (response.status === 503) return { status: "unavailable" };
  if (!response.ok) return { status: "provider-error" };
  try {
    const payload = await response.json() as { chunks?: unknown; durationMs?: unknown };
    if (!Array.isArray(payload.chunks)) return { status: "provider-error" };
    return {
      status: "ok",
      chunks: payload.chunks.filter(isChunk).map(({ key, title, text }) => ({
        key,
        text,
        ...(title === undefined ? {} : { title }),
      })),
      ...providerDuration(payload.durationMs),
    };
  }
  catch (error) {
    return { status: isTimeout(error) ? "timeout" : "provider-error" };
  }
}

export function createSiteSearchWorkerProvider(dependencies: {
  origin: string | undefined;
  fetch: Fetch;
  /** Google-signed identity whose audience is the Worker origin. */
  identityToken(audience: string): Promise<string>;
  timeoutMs: number;
  correlationId?(): string | undefined;
}): SiteSearchProvider {
  // One instance serves one visitor search: its deadline starts at the first call
  // and also bounds the unfiltered retry of a filtered search.
  let deadline: AbortSignal | undefined;
  return {
    async search(query, types): Promise<SiteSearchProviderReply> {
      const target = endpoint(dependencies.origin, "/search");
      if (!target) return { status: "unavailable" };
      const headers = requestHeaders(dependencies.correlationId?.());

      // The deadline covers identity acquisition and every Worker call.
      deadline ??= AbortSignal.timeout(dependencies.timeoutMs);
      if (deadline.aborted) return { status: "timeout" };
      const signal = deadline;
      const expired = deadlineExpiry(signal);
      let response: Response;
      try {
        if (!target.loopback) {
          const token = await Promise.race([dependencies.identityToken(target.url.origin), expired]);
          headers.set("authorization", `Bearer ${token}`);
        }
        response = await dependencies.fetch(target.url, {
          method: "POST",
          headers,
          body: JSON.stringify(types ? { query, types } : { query }),
          cache: "no-store",
          redirect,
          signal,
        });
      }
      catch (error) {
        return { status: isTimeout(error) ? "timeout" : "unavailable" };
      }
      return replyFromResponse(response);
    },
  };
}
