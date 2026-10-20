const metadataIdentityUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const requestTimeoutMs = 2000;
const expiryMarginMs = 60_000;
const maxTokenLength = 8192;
const maxCachedAudiences = 4;

function tokenExpiry(token: string): number | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1] || !/^[\w-]+$/u.test(parts[1])) return undefined;
  try {
    const encoded = parts[1].replace(/-/gu, "+").replace(/_/gu, "/");
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== "object" || !("exp" in payload)) return undefined;
    const exp = payload.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;
  }
  catch { return undefined; }
}

/** Creates a bounded, per-process reader for Google runtime identity tokens. */
export function createRuntimeIdentityReader(dependencies: {
  fetch: typeof fetch;
  now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  const tokenCache = new Map<string, { token: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string>>();

  function validCachedToken(audience: string): string | undefined {
    const hit = tokenCache.get(audience);
    if (hit && hit.expiresAt > now() + expiryMarginMs) {
      tokenCache.delete(audience);
      tokenCache.set(audience, hit);
      return hit.token;
    }
    if (hit) tokenCache.delete(audience);
    return undefined;
  }

  function cached(audience: string): string | undefined {
    const hit = validCachedToken(audience);
    if (hit) return hit;
    void refresh(audience).catch(() => {});
    return undefined;
  }

  function refresh(audience: string): Promise<string> {
    let lookup = pending.get(audience);
    if (!lookup) {
      lookup = (async () => {
        const endpoint = new URL(metadataIdentityUrl);
        endpoint.searchParams.set("audience", audience);
        endpoint.searchParams.set("format", "full");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const response = await dependencies.fetch(endpoint, {
            headers: { "Metadata-Flavor": "Google" },
            signal: controller.signal,
            cache: "no-store",
            redirect: "error",
          });
          if (!response.ok) throw new Error("Runtime identity unavailable");
          const token = await response.text();
          const expiresAt = tokenExpiry(token);
          if (!token || token.length > maxTokenLength || !expiresAt || expiresAt <= now() + expiryMarginMs)
            throw new Error("Runtime identity invalid");
          tokenCache.set(audience, { token, expiresAt });
          while (tokenCache.size > maxCachedAudiences) tokenCache.delete(tokenCache.keys().next().value!);
          return token;
        }
        catch {
          throw new Error("Runtime identity unavailable");
        }
        finally { clearTimeout(timeout); }
      })();
      pending.set(audience, lookup);
      void lookup.finally(() => {
        if (pending.get(audience) === lookup) pending.delete(audience);
      }).catch(() => {});
    }
    return lookup;
  }

  async function read(audience: string): Promise<string> {
    const hit = validCachedToken(audience);
    if (hit) return hit;
    return refresh(audience);
  }

  return { read, cached };
}
