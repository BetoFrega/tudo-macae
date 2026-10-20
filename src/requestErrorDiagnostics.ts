import { edgeRequestIdHeader, requestCorrelationId, requestCorrelationIdHeader } from "@tudomacae/www-origin-routing/contract";
import { authenticationRequestId } from "@tudomacae/authentication/diagnostics";
import { createHash } from "node:crypto";
import type { Instrumentation } from "next";

type Request = Parameters<Instrumentation.onRequestError>[1];
type Context = Parameters<Instrumentation.onRequestError>[2];

function property(error: unknown, key: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    return Reflect.get(error, key);
  }
  catch { return undefined; }
}

function fingerprint(value: unknown) {
  return typeof value === "string"
    ? createHash("sha256").update(value).digest("hex")
    : undefined;
}

/** Only code locations survive; exception messages may contain private inputs. */
function codeFrames(stack: unknown) {
  if (typeof stack !== "string") return [];
  return stack.split("\n").slice(1).flatMap((line) => {
    const match = line.match(/(?:^|[(/])(\.next\/(?:dev\/)?server|src)\/([a-zA-Z0-9_./()[\]@-]+:\d+:\d+)/u);
    return match ? [`${match[1]}/${match[2]}`] : [];
  }).slice(0, 8);
}

function header(request: Request, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

const reportedCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EPIPE", "permission-denied", "failed-precondition", "unavailable", "deadline-exceeded", "resource-exhausted"]);

function reportedCode(code: unknown) {
  if (typeof code === "string") return reportedCodes.has(code) ? code : undefined;
  return typeof code === "number" && Number.isInteger(code) && code >= 0 && code <= 16 ? code : undefined;
}

function reportedDigest(digest: unknown) {
  return typeof digest === "string" && /^\d{1,20}$/u.test(digest) ? digest : undefined;
}

function requestTraceId(request: Request) {
  const trace = header(request, "x-cloud-trace-context")?.match(/^([a-f0-9]{32})\/(\d{1,20})(?:;o=[01])?$/u);
  const traceParent = header(request, "traceparent")?.match(/^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/u);
  return trace?.[1] ?? traceParent?.[1];
}

function cloudTrace(traceId: string | undefined) {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  return traceId && project && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(project)
    ? { "logging.googleapis.com/trace": `projects/${project}/traces/${traceId}` }
    : {};
}

function correlationId(request: Request) {
  return requestCorrelationId(header(request, edgeRequestIdHeader)) ?? requestCorrelationId(header(request, requestCorrelationIdHeader));
}

export function reportRequestError(error: unknown, request: Request, context: Context) {
  const message = property(error, "message");
  const stack = property(error, "stack");
  const digest = property(error, "digest");
  const code = property(error, "code");
  const authenticationId = property(error, "authenticationRequestId");
  const traceId = requestTraceId(request);
  console.error(JSON.stringify({
    severity: "ERROR",
    event: "next.request.error",
    message: "Next.js request failed",
    timestamp: new Date().toISOString(),
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/u.test(request.method) ? request.method : "other",
    rsc: header(request, "rsc") === "1",
    prefetch: header(request, "next-router-prefetch") === "1",
    revision: process.env.K_REVISION,
    service: process.env.K_SERVICE,

    correlationId: correlationId(request),
    authenticationRequestId: authenticationRequestId(typeof authenticationId === "string" ? authenticationId : undefined),
    digest: reportedDigest(digest),
    code: reportedCode(code),
    messageHash: fingerprint(message),
    stackHash: fingerprint(stack),
    frames: codeFrames(stack),
    traceId,
    ...cloudTrace(traceId),
  }));
}
