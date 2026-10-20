function expectedHost(request: Request, forwardedHost: string | null): string | null {
  const hostHeader = request.headers.get("host");
  if (forwardedHost && hostHeader && forwardedHost !== hostHeader) return null;
  return forwardedHost || hostHeader;
}

/** Throws when the request URL or the forwarded values do not form a URL. */
function expectedOrigin(request: Request): URL | null {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost?.includes(",") || forwardedProto?.includes(",")) return null;
  const host = expectedHost(request, forwardedHost);
  const protocol = forwardedProto || new URL(request.url).protocol.replace(/:$/u, "");
  if (!host || !protocol) return null;
  return new URL(`${protocol}://${host}`);
}

export function isSameOriginMutation(request: Request): boolean {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin || suppliedOrigin === "null") return false;

  let origin: URL;
  let expected: URL | null;
  try {
    origin = new URL(suppliedOrigin);
    expected = expectedOrigin(request);
  }
  catch {
    return false;
  }
  if (!expected) return false;

  return origin.origin === expected.origin && suppliedOrigin === origin.origin;
}

function hasAcceptableJsonHeaders(request: Request, maxBytes: number): boolean {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return false;
  const length = request.headers.get("content-length");
  return !length || (/^\d+$/u.test(length) && Number(length) <= maxBytes);
}

async function readBoundedChunks(body: NonNullable<Request["body"]>, maxBytes: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  catch {
    return null;
  }
  return { chunks, size };
}

function parseJsonChunks(chunks: Uint8Array[], size: number): unknown | null {
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  catch {
    return null;
  }
}

export async function readBoundedJson(request: Request, maxBytes = 1024 * 1024): Promise<unknown | null> {
  if (!hasAcceptableJsonHeaders(request, maxBytes)) return null;
  if (!request.body) return null;
  const read = await readBoundedChunks(request.body, maxBytes);
  if (!read) return null;
  return parseJsonChunks(read.chunks, read.size);
}

export async function hasEmptyBody(request: Request): Promise<boolean> {
  const length = request.headers.get("content-length");
  if (length && length !== "0") return false;
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    const first = await reader.read();
    if (!first.done) await reader.cancel();
    return first.done;
  }
  catch {
    return false;
  }
}
