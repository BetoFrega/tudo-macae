interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

// The app still asks the Cloud Run metadata server for Google identity tokens.
// In the Worker that request answers this marker, and calls to an origin with a
// `WebRenderer` service binding travel through the binding without it: only a
// Worker that binds the entrypoint can call it (ADR 0046).
const metadataIdentityUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
// An unsigned JWT for the binding, expiring in 2100, so the runtime identity reader
// caches it like a Google token; no service ever receives it.
export const bindingIdentityToken = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ3ZWItd29ya2VyLXNlcnZpY2UtYmluZGluZyIsImV4cCI6NDEwMjQ0NDgwMH0.";

const boundOrigins = [
  { originVariable: "AUTHENTICATION_API_URL", binding: "API" },
  { originVariable: "SITE_SEARCH_URL", binding: "SITE_SEARCH" },
] as const;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function boundFetcher(environment: Record<string, unknown>, url: string) {
  const origin = URL.parse(url)?.origin;
  for (const { originVariable, binding } of boundOrigins) {
    const configured = environment[originVariable];
    const fetcher = environment[binding] as Fetcher | undefined;
    if (fetcher && typeof configured === "string" && URL.parse(configured)?.origin === origin) return fetcher;
  }
  return undefined;
}

export function routeOutboundFetch(original: typeof fetch, environment: Record<string, unknown>): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input);
    if (url.startsWith(`${metadataIdentityUrl}?`)) {
      const audience = new URL(url).searchParams.get("audience") ?? "";
      if (boundFetcher(environment, audience)) return new Response(bindingIdentityToken);
    }
    const fetcher = boundFetcher(environment, url);
    if (!fetcher) return original(input, init);
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    if (headers.get("authorization") === `Bearer ${bindingIdentityToken}`) headers.delete("authorization");
    return fetcher.fetch(new Request(request, { headers }));
  };
}
