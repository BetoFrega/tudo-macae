import { createHash } from "node:crypto";
import type { BrowserContext, Request, Response } from "@playwright/test";
import { z } from "zod";

const routes = new Set(["admin", "categorias", "categoria", "anuncio", "editar", "novo", "publicar", "minha-conta", "anuncios", "noticias", "redacao", "pautas", "api", "<id>"]);
function safePath(path: string) {
  return path.split(/[?#]/u)[0]!.split("/").map(part => !part || routes.has(part) ? part : "<id>").join("/").slice(0, 300);
}

export const httpFailureSchema = z.object({
  at: z.iso.datetime(),
  status: z.number().int().min(500).max(599),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "other"]),
  path: z.string().transform(safePath),
  rsc: z.boolean(),
  prefetch: z.boolean(),
  traceId: z.string().regex(/^[a-f0-9]{32}$/u).optional(),
  requestId: z.string().regex(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u).optional(),
  pathHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  actionId: z.string().regex(/^[a-f0-9]{16,128}$/u).optional(),
  requestBodyBytes: z.number().int().nonnegative().optional(),
  bodyBytes: z.number().int().nonnegative().optional(),
  digest: z.string().regex(/^\d{1,20}$/u).optional(),
  expected: z.literal("malformed-emulator-fixture").optional(),
  bodyKind: z.enum(["rsc", "html", "json", "other", "unavailable"]),
});
export type HttpFailure = z.infer<typeof httpFailureSchema>;
export const httpFailureAttachment = "http-failures.json";

/** Only the owned malformed-record window can accept its exact GET render failure. */
export function createExpectedRenderFailureScope() {
  let activePath: string | undefined;
  return {
    async during<T>(pathname: string, operation: () => Promise<T>): Promise<T> {
      if (!pathname.startsWith("/") || pathname.startsWith("//") || /[?#*]/u.test(pathname)) {
        throw new Error("Expected render failures require an exact local pathname");
      }
      if (activePath) throw new Error("Expected render failure scopes cannot overlap");
      activePath = pathname;
      try {
        return await operation();
      }
      finally { activePath = undefined; }
    },
    matches(method: string, pathname: string, prefetch: boolean) {
      return method === "GET" && pathname === activePath && !prefetch;
    },
  };
}

/** Next emits tree, static, runtime (2), and runtime-shell (3) prefetch requests. */
export function isNextPrefetch(headers: Record<string, string>): boolean {
  return headers["next-router-prefetch"] !== undefined || headers["next-router-segment-prefetch"] !== undefined;
}

const httpFailureMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
function failureMethod(method: string): HttpFailure["method"] {
  return httpFailureMethods.has(method) ? method as HttpFailure["method"] : "other";
}

function traceIdOf(headers: Record<string, string>, requestHeaders: Record<string, string>) {
  const traceHeader = headers["x-cloud-trace-context"] ?? requestHeaders["x-cloud-trace-context"];
  return traceHeader?.match(/^([a-f0-9]{32})\/\d+(?:;o=[01])?$/u)?.[1];
}

function correlationIds(headers: Record<string, string>, requestHeaders: Record<string, string>) {
  const traceId = traceIdOf(headers, requestHeaders);
  const requestId = headers["x-request-id"]?.match(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u)?.[0];
  const actionId = requestHeaders["next-action"]?.match(/^[a-f0-9]{16,128}$/u)?.[0];
  return {
    ...(traceId ? { traceId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(actionId ? { actionId } : {}),
  };
}

function actionRequestBodyBytes(request: Request, actionId: string | undefined) {
  if (request.method() !== "POST" || !actionId) return {};
  try {
    const requestBodyBytes = request.postDataBuffer()?.length;
    return requestBodyBytes === undefined ? {} : { requestBodyBytes };
  }
  catch {
    // The response remains evidence even if Playwright cannot read request metadata.
    return {};
  }
}

function bodyKindOf(contentType: string): HttpFailure["bodyKind"] {
  if (contentType.includes("text/x-component")) return "rsc";
  if (contentType.includes("text/html")) return "html";
  if (contentType.includes("application/json")) return "json";
  return "other";
}

function describeFailure(response: Response, expectedScope: ReturnType<typeof createExpectedRenderFailureScope> | undefined): HttpFailure {
  const request = response.request();
  const requestHeaders = request.headers();
  const method = request.method();
  const pathname = new URL(response.url()).pathname;
  const prefetch = isNextPrefetch(requestHeaders);
  const ids = correlationIds(response.headers(), requestHeaders);
  return {
    at: new Date().toISOString(), status: response.status(),
    method: failureMethod(method),
    path: safePath(pathname),
    pathHash: createHash("sha256").update(pathname).digest("hex"),
    rsc: requestHeaders.rsc === "1", prefetch,
    bodyKind: "unavailable",
    ...(expectedScope?.matches(method, pathname, prefetch)
      ? { expected: "malformed-emulator-fixture" as const }
      : {}),
    ...ids,
    ...actionRequestBodyBytes(request, ids.actionId),
  };
}

async function attachFailureBody(failure: HttpFailure, response: Response) {
  try {
    const body = await response.body();
    const timing = response.request().timing();
    if (timing.responseEnd >= 0) failure.durationMs = timing.responseEnd;
    failure.bodyBytes = body.length;
    failure.bodyHash = createHash("sha256").update(body).digest("hex");
    failure.bodyKind = bodyKindOf(response.headers()["content-type"] ?? "");
    const digest = body.subarray(0, 65536).toString().match(/"digest"\s*:\s*"(\d{1,20})"/u)?.[1];
    if (digest) failure.digest = digest;
  }
  catch { /* The status and correlation remain evidence without a body. */ }
}

export function observeHttpFailures(context: BrowserContext, failures: HttpFailure[], pending: Promise<void>[], origin: string, expectedScope?: ReturnType<typeof createExpectedRenderFailureScope>) {
  const observation = { otherHttpError: false };
  context.on("response", (response) => {
    if (new URL(response.url()).origin !== origin) return;
    if (response.status() >= 400 && response.status() < 500) observation.otherHttpError = true;
    if (response.status() < 500 || response.status() > 599) return;
    const failure = describeFailure(response, expectedScope);
    // Preserve the HTTP failure even if reading its body fails or the page closes.
    failures.push(failure);
    if (failures.length > 50) return;
    pending.push(attachFailureBody(failure, response));
  });
  return observation;
}
