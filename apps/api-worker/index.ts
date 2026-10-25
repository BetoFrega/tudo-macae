import { createProductionClassifiedsDependencies } from "./production";
import { PhotoObjectUnavailable } from "@tudomacae/classifieds-photos";
import { isClassifiedsPhotoRoute } from "./lib/classifiedsPhotoHttp";
import { isClassifiedsCanonicalRoute } from "./lib/classifiedsCanonical";
import { isEdgeRequestId, requestCorrelationId, requestCorrelationIdHeader } from "@tudomacae/www-origin-routing/contract";
import { authenticationRequestId, createAuthenticationDiagnostics, type AuthenticationDiagnosticEvent } from "@tudomacae/authentication/diagnostics";
import { isIdentityReader } from "./lib/serviceIdentity";
import { isClassifiedsRequestId } from "@tudomacae/classifieds-client/protocol";
import { classifiedsFailureCause } from "./diagnostics";
import { serveApiRequest } from "./lib/serveApiRequest";
import { runScheduledMaintenance } from "./lib/scheduledMaintenance";
import { mediaFailureRoute, mediaUnavailableMessage } from "./lib/mediaHttp";
import { blogFailureRoute, blogUnavailableMessage } from "./lib/blogHttp";
import { mediaErrorReportedHeader } from "@tudomacae/editorial-media/protocol";
import { blogErrorReportedHeader } from "@tudomacae/editorial-blog/protocol";
import { blogPublicErrorReportedHeader } from "@tudomacae/editorial-blog/publicProtocol";
import { blogPublicFailureRoute, blogPublicUnavailableMessage } from "./lib/blogPublicHttp";
import type { AuthenticationMail, WorkerDependencies } from "./lib/workerDependencies";
import type { HumanChallengeUnavailable } from "./lib/humanChallenge";
import { createOfferEvents } from "./lib/offerEvents";

type Diagnostics = ReturnType<typeof createAuthenticationDiagnostics>;
/** Mutable per-request outcome shared by the handler, its dependencies and late runtime proofs. */
type RequestState = {
  correlationId: string;
  responseFinalized: boolean;
  failureCause?: string;
  photoOperationId?: string;
  operation?: string;
  mediaOperationId?: string;
  failureCategory?: string;
  dependencyFailure?: { category: NonNullable<AuthenticationDiagnosticEvent["dependencyFailure"]>; status?: number | undefined };
};
type RequestContext = {
  env: Env;
  diagnostics: Diagnostics;
  state: RequestState;
  classifiedsRequest: boolean;
  silenced: boolean;
  requestId: string;
  pathname: string;
};

function resolveRequestId(request: Request, classifiedsRequest: boolean) {
  const supplied = request.headers.get("x-request-id");
  if (classifiedsRequest && supplied && isClassifiedsRequestId(supplied)) return supplied;
  return authenticationRequestId(supplied) ?? crypto.randomUUID();
}

function edgeCorrelationId(request: Request) {
  const providerId = request.headers.get("cf-ray");
  return providerId && isEdgeRequestId(providerId) ? providerId : crypto.randomUUID();
}

function diagnosticWriter(env: Env, dependencies: WorkerDependencies, classifiedsRequest: boolean) {
  return (event: AuthenticationDiagnosticEvent) => {
    if (classifiedsRequest) return;
    if (dependencies.writeDiagnostic) {
      dependencies.writeDiagnostic(event);
      return;
    }
    if (env.AUTHENTICATION_DIAGNOSTICS_ENABLED !== "true") return;
    if (event.outcome === "failed") console.error(JSON.stringify(event));
    else console.log(JSON.stringify(event));
  };
}

function startWatchdog(diagnostics: Diagnostics, silenced: boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveWatchdog = () => {};
  const done = new Promise<void>((resolve) => {
    if (silenced) {
      resolve();
      return;
    }
    resolveWatchdog = resolve;
    timer = setTimeout(() => {
      diagnostics.deadline();
      resolve();
    }, 5000);
  });
  return { done, complete() {
    clearTimeout(timer);
    resolveWatchdog();
  } };
}

function proveParentCorrelation(context: RequestContext, parentCorrelationId: string | undefined, verifyRuntimeIdentity: () => Promise<boolean>, execution?: ExecutionContext) {
  if (!parentCorrelationId) return;
  const { diagnostics, state } = context;
  const proof = diagnostics.run("runtime_identity", verifyRuntimeIdentity)
    .then((valid) => {
      if (!state.responseFinalized && valid && diagnostics.correlate(parentCorrelationId)) state.correlationId = parentCorrelationId;
    })
    .catch(() => { /* Optional runtime proof cannot change the public authentication response. */ });
  if (!context.classifiedsRequest) execution?.waitUntil(proof);
}

function isClassifiedsPath(pathname: string) {
  return pathname.startsWith("/api/trpc/classifieds") || isClassifiedsCanonicalRoute(pathname) || isClassifiedsPhotoRoute(pathname);
}

/** Canonical lookups are public and the same for every caller; every other answer is private. */
function setCacheControl(response: Response, pathname: string) {
  if (!(isClassifiedsCanonicalRoute(pathname) && response.status === 200)) response.headers.set("cache-control", "private, no-store");
}

function failedResponse(error: unknown, { state, classifiedsRequest, pathname }: RequestContext) {
  if (classifiedsRequest) state.failureCause ??= classifiedsFailureCause(error);
  state.failureCategory ??= error instanceof TypeError ? "type_error" : "dependency_or_runtime";
  const message = mediaFailureRoute(pathname) ? mediaUnavailableMessage : blogFailureRoute(pathname) ? blogUnavailableMessage : blogPublicFailureRoute(pathname) ? blogPublicUnavailableMessage : "Não foi possível acessar sua conta.";
  return Response.json({ error: message }, { status: 503 });
}

function failureEventName(failureCategory: string | undefined, classifiedsRequest: boolean, pathname: string) {
  if (failureCategory === "email_delivery") return "authentication.email.delivery_failed";
  if (mediaFailureRoute(pathname)) return "media.request.unavailable";
  if (blogFailureRoute(pathname)) return "blog.request.unavailable";
  if (blogPublicFailureRoute(pathname)) return "blog.public.unavailable";
  return classifiedsRequest ? "classifieds.request.unavailable" : "authentication.request.unavailable";
}

/** Classifieds, Media, Blog and public Blog failures are their own signals, never authentication diagnostics. */
const hasOwnFailureSignal = (pathname: string, classifiedsRequest: boolean) => classifiedsRequest || !!mediaFailureRoute(pathname) || !!blogFailureRoute(pathname) || !!blogPublicFailureRoute(pathname);

function failureRoute(pathname: string) {
  const mediaRoute = mediaFailureRoute(pathname) ?? blogFailureRoute(pathname) ?? blogPublicFailureRoute(pathname);
  if (mediaRoute) return mediaRoute;
  if (isClassifiedsCanonicalRoute(pathname)) return "/api/classifieds/canonical/:target";
  if (isClassifiedsPhotoRoute(pathname)) return "/api/classifieds/photos/:operation";
  if (pathname.startsWith("/internal/")) return "/internal/identities/:uid";
  return pathname.startsWith("/api/trpc/") ? "/api/trpc/:procedure" : "/api/auth/:operation";
}

const mediaFailureFields = ({ operation, mediaOperationId }: RequestState) =>
  ({ ...(operation ? { operation } : {}), ...(mediaOperationId ? { operationId: mediaOperationId } : {}) });
const classifiedsFailureFields = ({ failureCause, operation, photoOperationId }: RequestState) =>
  ({ causeCode: failureCause ?? "unknown_error", ...(operation ? { operation } : {}), ...(photoOperationId ? { operationId: photoOperationId } : {}) });

function logUnobservedFailure({ env, state, classifiedsRequest, requestId, pathname }: RequestContext, status: number) {
  console.error(JSON.stringify({
    event: failureEventName(state.failureCategory, classifiedsRequest, pathname),
    failureCategory: state.failureCategory ?? "handler_failure",
    ...(classifiedsRequest ? classifiedsFailureFields(state) : {}),
    ...(mediaFailureRoute(pathname) || blogFailureRoute(pathname) || blogPublicFailureRoute(pathname) ? mediaFailureFields(state) : {}),
    service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown",
    release: env.CF_VERSION_METADATA?.id ?? "unknown", outcome: "failed",
    route: failureRoute(pathname),
    requestId, correlationId: state.correlationId, statusClass: `${Math.floor(status / 100)}xx`,
  }));
}

/** Media and Blog mark the 5xx they logged, so the app does not log the same failure again. */
function ownReportHeader(pathname: string) {
  if (mediaFailureRoute(pathname)) return mediaErrorReportedHeader;
  if (blogPublicFailureRoute(pathname)) return blogPublicErrorReportedHeader;
  return blogFailureRoute(pathname) ? blogErrorReportedHeader : undefined;
}

function setProtocolHeaders(response: Response, { env, state, classifiedsRequest, requestId, pathname }: RequestContext) {
  if (classifiedsRequest && response.status >= 500) response.headers.set("x-classifieds-error-reported", "1");
  const reportedHeader = ownReportHeader(pathname);
  if (reportedHeader && response.status >= 500) response.headers.set(reportedHeader, "1");
  setCacheControl(response, pathname);
  response.headers.set("x-request-id", requestId);
  response.headers.set(requestCorrelationIdHeader, state.correlationId);
  response.headers.set("x-authentication-protocol", "1");
  response.headers.set("x-classifieds-protocol", "1");
  if (env.CF_VERSION_METADATA?.id)
    response.headers.set(
      "x-authentication-release",
      env.CF_VERSION_METADATA.id,
    );
}

function finalizeResponse(response: Response, context: RequestContext) {
  const { diagnostics, state } = context;
  const failed = !!state.failureCategory || response.status >= 500;
  if (failed)
    diagnostics.fail(state.failureCategory === "email_delivery" ? "email_delivery" : "dependency", response.status, undefined, state.dependencyFailure);
  else diagnostics.complete(response.status);
  if (context.silenced && failed) logUnobservedFailure(context, response.status);
  setProtocolHeaders(response, context);
  return response;
}

export type { AuthenticationMail, WorkerDependencies } from "./lib/workerDependencies";
export function createApiWorker(dependencies: WorkerDependencies = {}) {
  return {
    async scheduled(controller: ScheduledController, env: Env) {
      await runScheduledMaintenance(dependencies, env, controller.scheduledTime);
    },
    async fetch(request: Request, env: Env, execution?: ExecutionContext): Promise<Response> {
      const startedAt = Date.now();
      const pathname = new URL(request.url).pathname;
      const classifiedsRequest = isClassifiedsPath(pathname);
      const requestId = resolveRequestId(request, classifiedsRequest);
      const state: RequestState = { correlationId: edgeCorrelationId(request), responseFinalized: false };
      const parentCorrelationId = requestCorrelationId(request.headers.get(requestCorrelationIdHeader));
      let runtimeIdentity: Promise<boolean> | undefined;
      const verifyRuntimeIdentity = () => runtimeIdentity ??= dependencies.boundRenderer
        ? Promise.resolve(true)
        : isIdentityReader(request, env, dependencies.serviceKeys);
      const diagnostics = createAuthenticationDiagnostics({
        service: "api-worker", environment: env.WORKERS_ENVIRONMENT,
        release: env.CF_VERSION_METADATA?.id, requestId, correlationId: state.correlationId,
        traceparent: request.headers.get("traceparent") ?? undefined,
        path: pathname, now: () => performance.now(),
        sampleSuccess: dependencies.sampleDiagnosticSuccess,
        write: diagnosticWriter(env, dependencies, hasOwnFailureSignal(pathname, classifiedsRequest)),
      });
      const silenced = hasOwnFailureSignal(pathname, classifiedsRequest) || (env.AUTHENTICATION_DIAGNOSTICS_ENABLED !== "true" && !dependencies.writeDiagnostic);
      const context: RequestContext = { env, diagnostics, state, classifiedsRequest, silenced, requestId, pathname };
      const watchdog = startWatchdog(diagnostics, silenced);
      execution?.waitUntil(watchdog.done);
      const requestDependencies = {
        ...dependencies,
        ...(dependencies.classifiedsPhotos ? { classifiedsPhotos: (environment: Env) => dependencies.classifiedsPhotos!(environment, { requestId }) } : {}),
        diagnostics,
        verifyRuntimeIdentity,
        offerEvents: dependencies.offerEvents ?? ((environment: Env) => createOfferEvents({
          projectToken: environment.POSTHOG_PROJECT_TOKEN, environment: environment.WORKERS_ENVIRONMENT, release: environment.CF_VERSION_METADATA?.id,
          fetch, waitUntil: promise => execution?.waitUntil(promise), log: line => console.warn(line), now: Date.now,
        })),
        reportHumanChallengeUnavailable(category: HumanChallengeUnavailable, status?: number) {
          state.failureCategory = "dependency";
          state.dependencyFailure = { category, status };
        },
        reportEditorialImageFailure(stage: string) {
          state.failureCategory = "dependency";
          state.operation = stage;
        },
        reportMediaFailure(name?: string, operationId?: string) {
          state.operation = name;
          state.mediaOperationId = operationId;
        },
        reportBlogFailure(name?: string, correlationId?: string) {
          state.operation = name;
          // The protocol bounds it to an identifier, so the failure event and response header follow the caller's mutation.
          if (correlationId) state.correlationId = correlationId;
        },
        reportClassifiedsFailure(error: unknown, name?: string) {
          state.failureCause = classifiedsFailureCause(error);
          if (error instanceof PhotoObjectUnavailable && isClassifiedsRequestId(error.operationId)) state.photoOperationId = error.operationId;
          state.operation = name;
        },

        async sendMail(mail: AuthenticationMail, environment: Env) {
          // Mail must leave time to return the committed account/session within
          // the HTTP client's five-second deadline, including slow providers.
          const budget = Math.max(1, Math.min(2000, 4000 - (Date.now() - startedAt)));
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              dependencies.sendMail
                ? dependencies.sendMail(mail, environment)
                : environment.EMAIL.send(mail),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Email delivery deadline")), budget);
              }),
            ]);
          }
          catch (error) {
            state.failureCategory = "email_delivery";
            throw error;
          }
          finally {
            clearTimeout(timer);
          }
        },
      };
      let response;
      try {
        proveParentCorrelation(context, parentCorrelationId, verifyRuntimeIdentity, execution);
        const headers = new Headers(request.headers);
        headers.set("x-request-id", requestId);
        request = new Request(request, { headers });
        response = await serveApiRequest(request, env, requestDependencies);
      }
      catch (error) {
        response = failedResponse(error, context);
      }
      state.responseFinalized = true;
      watchdog.complete();
      return finalizeResponse(response, context);
    },
  } satisfies ExportedHandler<Env>;
}
function loopback(context: ExecutionContext): typeof fetch {
  return (input, init) => context.exports.default.fetch(input, init);
}
export default {
  fetch(request: Request, env: Env, context: ExecutionContext) {
    return createApiWorker(createProductionClassifiedsDependencies(env, fetch, loopback(context))).fetch(request, env, context);
  },
  scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    return createApiWorker(createProductionClassifiedsDependencies(env, fetch, loopback(context))).scheduled(controller, env);
  },
} satisfies ExportedHandler<Env>;
