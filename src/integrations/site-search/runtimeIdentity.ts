export async function metadataIdentityToken(audience: string) {
  const endpoint = new URL("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity");
  endpoint.searchParams.set("audience", audience);
  endpoint.searchParams.set("format", "full");
  const response = await fetch(endpoint, {
    headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2_000), cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error("Runtime identity unavailable");
  const token = await response.text();
  if (!token || token.length > 8192) throw new Error("Runtime identity invalid");
  return token;
}
