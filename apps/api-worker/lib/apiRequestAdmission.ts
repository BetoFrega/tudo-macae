import z from "zod";
import type { AuthenticationStage } from "@tudomacae/authentication/diagnostics";
import { isEditorialImageRoute } from "./editorialImageHttp";
import { isMediaRoute, mediaUploadBodyLimit } from "./mediaHttp";
import type { WorkerDependencies } from "./workerDependencies";

const servedAuthPaths = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/sign-out",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/get-session",
]);

function unsupportedProtocol(request: Request) {
  const protocol = request.headers.get("x-authentication-protocol");
  const classifiedsProtocol = request.headers.get("x-classifieds-protocol");
  return (protocol && protocol !== "1") || (classifiedsProtocol && classifiedsProtocol !== "1");
}

function isServedPath(path: string, photoRequest: boolean) {
  if (path.startsWith("/api/auth/")) return servedAuthPaths.has(path);
  return photoRequest || isMediaRoute(path) || isEditorialImageRoute(path) || path.startsWith("/api/trpc/") || path.startsWith("/internal/identities/");
}

function isForeignOriginMutation(request: Request, env: Env, path: string) {
  return request.method !== "GET"
    && request.method !== "HEAD"
    && path.startsWith("/api/")
    && request.headers.get("origin") !== new URL(env.PUBLIC_APP_ORIGIN).origin;
}

async function photoServiceQualified(dependencies: WorkerDependencies) {
  try {
    return !!dependencies.classifiedsPhotos && (await dependencies.classifiedsQualification?.()) === true;
  }
  catch (error) {
    // Unavailable controls keep the prepared service closed; an unreadable authority fails the request.
    if (dependencies.classifiedsAuthority) throw error;
    return false;
  }
}

/** Rejects before buffering: protocol, route allowlist, origin, then photo service qualification. */
export async function rejectRequest(request: Request, env: Env, path: string, photoRequest: boolean, dependencies: WorkerDependencies) {
  if (unsupportedProtocol(request)) return new Response(null, { status: 409 });
  if (!isServedPath(path, photoRequest)) return new Response(null, { status: 404 });
  if (isForeignOriginMutation(request, env, path))
    return Response.json(
      { error: "Forbidden origin" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  if (photoRequest && !(await photoServiceQualified(dependencies))) return new Response(null, { status: 404 });
  return undefined;
}

export function requestBodyLimit(path: string, photoRequest: boolean) {
  if (photoRequest && path.endsWith("/upload")) return 1024 * 1024;
  // A Blog body holds up to 200,000 characters; JSON escapes one as at most six bytes.
  if (path === "/api/trpc/blogWrite") return 2 * 1024 * 1024;
  return path.startsWith("/api/media/uploads/") ? mediaUploadBodyLimit : 65536;
}

function concatenate(chunks: Uint8Array[], size: number) {
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

async function readChunks(stream: ReadableStream<Uint8Array>, bodyLimit: number) {
  const reader = stream.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return concatenate(chunks, size);
      size += part.value.length;
      if (size > bodyLimit) return null;
      chunks.push(part.value);
    }
  }
  finally {
    await reader.cancel();
  }
}

/** Returns the request with its body buffered, or null when the body exceeds the limit. */
export async function readBoundedBody(request: Request, bodyLimit: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > bodyLimit) return null;
  if (!request.body) return request;
  const body = await readChunks(request.body, bodyLimit);
  return body && new Request(request, { body });
}

function diagnosed<T>(dependencies: WorkerDependencies, name: AuthenticationStage, run: () => Promise<T>) {
  return dependencies.diagnostics ? dependencies.diagnostics.run(name, run) : run();
}

/** The durable D1 phase alone admits requests; no remote flag is read on the request path. */
export async function authorityOpen(dependencies: WorkerDependencies & { authenticationDatabase: D1Database }) {
  const phase = await diagnosed(dependencies, "authority", () => dependencies.authenticationDatabase.prepare(
    "SELECT phase FROM authentication_authority WHERE singleton=1",
  ).first<{ phase: string }>());
  return phase?.phase === "active";
}

export const authorityClosedResponse = () => Response.json(
  { error: "Authentication authority unavailable" },
  {
    status: 503,
    headers: {
      "cache-control": "private, no-store",
      "x-authentication-outcome": "closed",
    },
  },
);

/** Returns the request carrying the verified forwarded client address, or null when it cannot be trusted. */
export async function trustForwardedAddress(request: Request, verifyRuntimeIdentity: () => Promise<boolean>) {
  const forwardedAddress = request.headers.get("x-authentication-client-ip");
  if (forwardedAddress === null) return request;
  if (!z.union([z.ipv4(), z.ipv6()]).safeParse(forwardedAddress).success
    || !(await verifyRuntimeIdentity()))
    return null;
  const trustedHeaders = new Headers(request.headers);
  trustedHeaders.set("cf-connecting-ip", forwardedAddress);
  trustedHeaders.delete("x-authentication-client-ip");
  return new Request(request, { headers: trustedHeaders });
}
