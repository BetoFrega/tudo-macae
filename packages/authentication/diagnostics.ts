import { requestCorrelationId } from "@tudomacae/www-origin-routing/contract";
export type AuthenticationStage = "transport" | "runtime_identity" | "authority" | "handler";
export type AuthenticationFailure = "timeout" | "network" | "http_5xx" | "protocol" | "dependency" | "email_delivery";
export type AuthenticationDiagnosticEvent = {
  event: "authentication.client.completed" | "authentication.client.failed" | "authentication.client.correlation_failed" | "authentication.worker.completed" | "authentication.worker.failed";
  service: "next-authentication-client" | "api-worker";
  environment: string;
  release: string;
  requestId: string;
  correlationId: string;
  traceId?: string;
  parentSpanId?: string;
  route: string;
  outcome: "completed" | "failed" | "closed" | "degraded";
  authenticationOutcome?: "completed" | "closed";
  correlationFailure?: "identity_unavailable" | "parent_not_retained";
  remoteCorrelationId?: string;
  durationMs: number;
  deadlineMs: number;
  stage?: AuthenticationStage;
  failureCategory?: AuthenticationFailure;
  status?: number;
  remoteRelease?: string;
  dependencyFailure?: "configuration" | "network" | "timeout" | "http_status" | "invalid_response";
  dependencyStatus?: number;
  stages: { stage: AuthenticationStage; durationMs: number; outcome: "completed" | "failed" | "pending" }[];
};

export function authenticationRequestId(value: string | null | undefined) {
  return value && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu.test(value) ? value.toLowerCase() : undefined;
}
export function authenticationTraceParent(value: string | null | undefined) {
  const match = value?.match(/^00-([a-f\d]{32})-([a-f\d]{16})-([a-f\d]{2})$/iu);
  return match && !/^0+$/u.test(match[1]) && !/^0+$/u.test(match[2]) ? value!.toLowerCase() : undefined;
}
function label(value: string | undefined) {
  return value && /^[a-z\d_.-]{1,128}$/iu.test(value) ? value : "unknown";
}
export function authenticationRoute(path: string) {
  return path.startsWith("/internal/")
    ? "/internal/identities/:uid"
    : path.startsWith("/api/trpc/")
      ? "/api/trpc/:procedure"
      : path.startsWith("/api/auth/") ? "/api/auth/:operation" : "other";
}

type AuthenticationOutcome = "completed" | "failed" | "closed";
type EmitDetails = { failureCategory?: AuthenticationFailure; status?: number; remoteRelease?: string; dependencyFailure?: NonNullable<AuthenticationDiagnosticEvent["dependencyFailure"]>; dependencyStatus?: number };

function eventName(service: AuthenticationDiagnosticEvent["service"], outcome: AuthenticationOutcome, degraded: boolean): AuthenticationDiagnosticEvent["event"] {
  if (degraded) return "authentication.client.correlation_failed";
  const side = service === "api-worker" ? "worker" : "client";
  return `authentication.${side}.${outcome === "failed" ? "failed" : "completed"}`;
}
function correlationFields(correlationFailure: AuthenticationDiagnosticEvent["correlationFailure"], remoteCorrelationId: string | undefined) {
  return {
    ...(correlationFailure ? { correlationFailure } : {}),
    ...(remoteCorrelationId ? { remoteCorrelationId } : {}),
  };
}
function traceFields(traceparent: string | undefined) {
  return traceparent ? { traceId: traceparent.slice(3, 35), parentSpanId: traceparent.slice(36, 52) } : {};
}
function outcomeFields(outcome: AuthenticationOutcome, degraded: boolean): Pick<AuthenticationDiagnosticEvent, "outcome" | "authenticationOutcome"> {
  // Degradation only applies to non-failed outcomes, so the failed check also narrows the type.
  if (!degraded || outcome === "failed") return { outcome };
  return { outcome: "degraded", authenticationOutcome: outcome };
}
function writeEvent(write: (event: AuthenticationDiagnosticEvent) => void, event: AuthenticationDiagnosticEvent) {
  try {
    write(event);
  }
  catch { /* Telemetry failure must not change authentication or its response. */ }
}

/** Retain failures independently of trace sampling; no input or exception text enters the event. */
export function createAuthenticationDiagnostics(configuration: {
  service: AuthenticationDiagnosticEvent["service"];
  environment?: string | undefined;
  release?: string | undefined;
  requestId: string;
  correlationId?: string | undefined;
  traceparent?: string | undefined;
  path: string;
  now: () => number;
  sampleSuccess?: (() => boolean) | undefined;
  write: (event: AuthenticationDiagnosticEvent) => void;
}) {
  const startedAt = configuration.now();
  const requestId = authenticationRequestId(configuration.requestId);
  let correlationId = requestCorrelationId(configuration.correlationId) ?? requestId;
  let correlationFailure: AuthenticationDiagnosticEvent["correlationFailure"];
  let remoteCorrelationId: string | undefined;
  const traceparent = authenticationTraceParent(configuration.traceparent);
  const timings: AuthenticationDiagnosticEvent["stages"] = [];
  let active: { stage: AuthenticationStage; at: number } | undefined;
  const pending: { stage: AuthenticationStage; at: number }[] = [];
  let lastStage: AuthenticationStage | undefined;
  let emitted = false;
  const elapsed = (from: number) => Math.max(0, Math.round(configuration.now() - from));
  function retained(outcome: AuthenticationOutcome) {
    return outcome === "failed" || Boolean(correlationFailure) || (configuration.sampleSuccess?.() ?? Math.random() < 0.1);
  }
  function emit(outcome: AuthenticationOutcome, details: EmitDetails = {}) {
    if (!requestId || emitted) return;
    if (!retained(outcome)) return;
    emitted = true;
    const degraded = outcome !== "failed" && correlationFailure !== undefined;
    writeEvent(configuration.write, {
      event: eventName(configuration.service, outcome, degraded),
      service: configuration.service,
      environment: label(configuration.environment), release: label(configuration.release),
      requestId, correlationId: correlationId ?? requestId,
      ...correlationFields(correlationFailure, remoteCorrelationId),
      ...traceFields(traceparent),
      route: authenticationRoute(configuration.path),
      ...outcomeFields(outcome, degraded),
      durationMs: elapsed(startedAt), deadlineMs: 5000,
      ...(lastStage ? { stage: lastStage } : {}),
      ...details,
      ...(details.remoteRelease ? { remoteRelease: label(details.remoteRelease) } : {}),
      stages: [...timings, ...[...(active ? [active] : []), ...pending].map(timing => ({ stage: timing.stage, durationMs: elapsed(timing.at), outcome: "pending" as const }))],
    });
  }
  function close(outcome: "completed" | "failed") {
    if (active) timings.push({ stage: active.stage, durationMs: elapsed(active.at), outcome });
    active = undefined;
  }
  return {
    correlate(value: string) {
      const validated = requestCorrelationId(value);
      if (!validated || emitted) return false;
      correlationId = validated;
      return true;
    },
    loseCorrelation(reason: NonNullable<AuthenticationDiagnosticEvent["correlationFailure"]>, remoteRoot?: string) {
      if (configuration.service !== "next-authentication-client") return;
      correlationFailure ??= reason;
      remoteCorrelationId = requestCorrelationId(remoteRoot);
    },
    start(stage: AuthenticationStage) {
      close("completed");
      active = { stage, at: configuration.now() };
      lastStage = stage;
    },
    deadline: () => emit("failed", { failureCategory: "timeout" }),
    async run<T>(stage: AuthenticationStage, operation: () => Promise<T>): Promise<T> {
      const at = configuration.now();
      const timing = { stage, at };
      pending.push(timing);
      lastStage = stage;
      let outcome: "completed" | "failed" = "completed";
      try {
        return await operation();
      }
      catch (error) {
        outcome = "failed";
        throw error;
      }
      finally {
        timings.push({ stage, durationMs: elapsed(at), outcome });
        pending.splice(pending.indexOf(timing), 1);
      }
    },
    complete(status: number, closed = false, remoteRelease?: string) {
      close("completed");
      emit(closed ? "closed" : "completed", { status, ...(remoteRelease ? { remoteRelease } : {}) });
    },
    fail(failureCategory: AuthenticationFailure, status?: number, remoteRelease?: string, dependency?: { category: NonNullable<AuthenticationDiagnosticEvent["dependencyFailure"]>; status?: number | undefined }) {
      close("failed");
      emit("failed", { failureCategory, ...(status === undefined ? {} : { status }), ...(remoteRelease ? { remoteRelease } : {}), ...(dependency ? { dependencyFailure: dependency.category, ...(dependency.status === undefined ? {} : { dependencyStatus: dependency.status }) } : {}) });
    },
  };
}
