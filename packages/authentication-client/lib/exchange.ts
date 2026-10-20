import { requestCorrelationId, requestCorrelationIdHeader } from "@tudomacae/www-origin-routing/contract";
import { authenticationRequestId, authenticationTraceParent, type AuthenticationFailure, type createAuthenticationDiagnostics } from "@tudomacae/authentication/diagnostics";

export type ExchangeOptions = {
  body?: unknown;
  credential?: string;
  bearer?: string;
  headers?: Headers;
  method?: string;
  forwardUnavailable?: boolean;
};
export type DiagnosticContext = { requestId?: string; traceparent?: string; correlationId?: string };
type ExchangeDiagnostics = ReturnType<typeof createAuthenticationDiagnostics>;
/** What the transport learned before it finished or threw; the failure report reads it. */
export type ExchangeAttempt = { response?: Response; remoteRelease?: string | undefined; closed: boolean; refused: boolean };

/** Forwards only the session cookie: any other caller cookie stays out of the authority request. */
export function authorityHeaders(source: Headers | undefined, publicOrigin: URL): Headers {
  const headers = new Headers(source);
  const sessionCookie = headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("session="));
  headers.delete("cookie");
  if (sessionCookie) headers.set("cookie", sessionCookie);
  headers.set("origin", publicOrigin.origin);
  headers.set("x-authentication-protocol", "1");
  return headers;
}

export function readDiagnosticContext(diagnostics: { context?: () => DiagnosticContext } | undefined): DiagnosticContext {
  try {
    return diagnostics?.context?.() ?? {};
  }
  catch {
    // Missing telemetry context does not deny authentication.
    return {};
  }
}

/** Sets request, correlation and trace headers; inbound tracestate and baggage never reach the authority. */
export function correlateRequest(headers: Headers, context: DiagnosticContext) {
  const requestId = authenticationRequestId(headers.get("x-request-id"))
    ?? authenticationRequestId(context.requestId) ?? crypto.randomUUID();
  headers.set("x-request-id", requestId);
  const correlationId = requestCorrelationId(context.correlationId) ?? requestCorrelationId(headers.get(requestCorrelationIdHeader)) ?? requestId;
  headers.set(requestCorrelationIdHeader, correlationId);
  const traceparent = authenticationTraceParent(context.traceparent)
    ?? authenticationTraceParent(headers.get("traceparent"));
  headers.delete("traceparent");
  headers.delete("tracestate");
  headers.delete("baggage");
  if (traceparent) headers.set("traceparent", traceparent);
  return { requestId, correlationId, traceparent };
}

export function applyRequestCredentials(headers: Headers, options: ExchangeOptions): void {
  if (options.credential) headers.set("cookie", `session=${encodeURIComponent(options.credential)}`);
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
}

export function authorityRequestInit(options: ExchangeOptions, headers: Headers, signal: AbortSignal): RequestInit {
  return {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"), headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store", redirect: "manual", signal,
  };
}

export function verifyRemoteCorrelation(response: Response, correlationId: string, diagnostics: ExchangeDiagnostics): void {
  const remoteRoot = requestCorrelationId(response.headers.get(requestCorrelationIdHeader));
  if (remoteRoot !== correlationId) diagnostics.loseCorrelation("parent_not_retained", remoteRoot);
}

export async function receiveAuthorityResponse<T>(
  response: Response,
  options: ExchangeOptions,
  attempt: ExchangeAttempt,
  receive: (response: Response) => Promise<T>,
): Promise<T> {
  attempt.remoteRelease = response.headers.get("x-authentication-release") ?? undefined;
  attempt.closed = response.status === 503 && response.headers.get("x-authentication-failure-category") === "authority_closed";
  if (response.status >= 500 && !options.forwardUnavailable)
    throw new Error("Authentication authority unavailable");
  if (response.headers.get("x-authentication-protocol") !== "1")
    throw new Error("Authentication protocol incompatible");
  attempt.refused = !response.ok && response.status < 500;
  return await receive(response);
}

export function reportExchangeSuccess(diagnostics: ExchangeDiagnostics, attempt: ExchangeAttempt): void {
  const response = attempt.response!;
  if (response.status >= 500 && !attempt.closed) diagnostics.fail("http_5xx", response.status, attempt.remoteRelease);
  else diagnostics.complete(response.status, attempt.closed, attempt.remoteRelease);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function failureCategory(timeout: boolean, response: Response | undefined): AuthenticationFailure {
  if (timeout) return "timeout";
  if (!response) return "network";
  return response.status >= 500 ? "http_5xx" : "protocol";
}

function failureMessage(error: unknown, response: Response | undefined): string {
  if (!response) return "Authentication transport unavailable";
  return error instanceof Error ? error.message : "Authentication response invalid";
}

/** Reports the failure and returns the error to throw; a closed or refused authority still completes. */
export function exchangeFailure(error: unknown, diagnostics: ExchangeDiagnostics, attempt: ExchangeAttempt): Error {
  const timeout = isTimeout(error);
  if (attempt.closed || attempt.refused) diagnostics.complete(attempt.response!.status, attempt.closed, attempt.remoteRelease);
  else diagnostics.fail(failureCategory(timeout, attempt.response), attempt.response?.status, attempt.remoteRelease);
  // Preserve the original in-memory cause without exporting its private message.
  const message = failureMessage(error, attempt.response);
  const failure = error instanceof TypeError ? new TypeError(message, { cause: error }) : new Error(message, { cause: error });
  if (timeout) failure.name = "TimeoutError";
  return failure;
}
