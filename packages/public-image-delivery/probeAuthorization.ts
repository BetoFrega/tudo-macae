import { editorialCacheProbeHeader } from "./contract";

export const editorialCacheProbeAuthorizationHeader = "x-editorial-cache-probe-authorization";
const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}
function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("");
}

// The Worker receives only this scoped key, never the provider purge credential.
export async function deriveEditorialCacheProbeSecret(purgeToken: string): Promise<string> {
  return hex(await hmac(purgeToken, "editorial-cache-probe:v1"));
}
function message(request: Request, timestamp: string): string {
  return `editorial-cache-probe:v1\n${timestamp}\n${request.method}\n${request.url}\n${request.headers.get(editorialCacheProbeHeader)}`;
}
export async function signEditorialCacheProbe(request: Request, secret: string, now = Date.now()): Promise<string> {
  const timestamp = String(Math.floor(now / 1000));
  return `v1:${timestamp}:${hex(await hmac(secret, message(request, timestamp)))}`;
}
export async function authorizeEditorialCacheProbe(request: Request, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret) return false;
  const value = request.headers.get(editorialCacheProbeAuthorizationHeader)?.match(/^v1:(\d{10}):([a-f0-9]{64})$/);
  if (!value || Math.abs(Math.floor(now / 1000) - Number(value[1])) > 60) return false;
  const expected = new Uint8Array(await hmac(secret, message(request, value[1])));
  const actual = Uint8Array.from(value[2].match(/../g)!, byte => Number.parseInt(byte, 16));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index]! ^ actual[index]!;
  return difference === 0;
}
