import { RequestCorrelationPropagator } from "@tudomacae/www-origin-routing/correlation";
import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { CompositePropagator, ExportResultCode, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { AlwaysOffSampler, BatchSpanProcessor, TraceIdRatioBasedSampler, TracerProvider } from "@opentelemetry/sdk-trace";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const posthogTracingFlagKey = "server-tracing";
const ingestionHost = "https://eu.i.posthog.com";
const serviceName = "tudo-macae-nextjs";
const operationNames = new Set([
  "BaseServer.handleRequest",
  "BaseServer.renderToResponse",
  "AppRender.getBodyResult",
  "AppRender.fetch",
  "AppRouteRouteHandlers.runHandler",
  "NextNodeServer.findPageComponents",
  "NextNodeServer.createComponentTree",
  "ResolveMetadata.generateMetadata",
]);
let tracerProvider: TracerProvider | undefined;

export type TracingEnvironment = "production" | "development" | "test" | "build" | "qualification";

export function tracingEnvironment(environment: Record<string, string | undefined>): TracingEnvironment {
  if (environment.NEXT_PHASE === "phase-production-build") return "build";
  if (environment.NODE_ENV === "test" || environment.NEXT_PUBLIC_APP_ENV === "test") return "test";
  if (environment.NEXT_PUBLIC_APP_ENV === "qualification") return "qualification";
  // Both hosting backends use Cloud Run; NODE_ENV alone also labels local
  // production builds as production and cannot establish the hosting boundary.
  if (environment.NODE_ENV === "production" && environment.K_SERVICE) return "production";
  return "development";
}

export function createTracingFlagDecision(
  projectToken: string,
  environment: TracingEnvironment,
  fetchFlag = fetch,
) {
  let expiresAt = 0;
  let enabled = false;
  let pending: Promise<boolean> | undefined;
  return async (): Promise<boolean> => {
    if (Date.now() < expiresAt) return enabled;
    if (pending) return pending;
    pending = (async () => {
      enabled = false;
      try {
        const response = await fetchFlag(`${ingestionHost}/flags/?v=2`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: projectToken,
            distinct_id: "",
            person_properties: { environment },
          }),
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const result = await response.json();
          enabled = result?.flags?.[posthogTracingFlagKey]?.enabled === true;
        }
      }
      catch {
        // Missing or unavailable release state must never enable ingestion.
      }
      expiresAt = Date.now() + 60_000;
      return enabled;
    })();
    try {
      return await pending;
    }
    finally {
      pending = undefined;
    }
  };
}

export function createSafeTraceExporter(
  exporter: SpanExporter,
  enabled: () => Promise<boolean>,
  environment: string,
  release: string,
): SpanExporter {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    "deployment.environment.name": environment,
    "service.version": release,
  });
  return {
    export(spans, callback) {
      void enabled().then((allowed) => {
        if (!allowed) {
          callback({ code: ExportResultCode.SUCCESS });
          return;
        }
        const safeSpans: ReadableSpan[] = spans.map((span) => {
          // Names, events, links, scope and resource metadata can also contain
          // URLs or exception content; retaining only numeric HTTP facts keeps
          // correlation and latency without exporting user-controlled strings.
          const attributes: ReadableSpan["attributes"] = {};
          for (const key of ["http.status_code", "http.response.status_code"]) {
            const value = span.attributes[key];
            if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
              attributes[key] = value;
            }
          }
          return {
            kind: span.kind,
            startTime: span.startTime,
            endTime: span.endTime,
            duration: span.duration,
            ended: span.ended,
            droppedAttributesCount: span.droppedAttributesCount,
            droppedEventsCount: span.droppedEventsCount,
            droppedLinksCount: span.droppedLinksCount,
            name: typeof span.attributes["next.span_type"] === "string" && operationNames.has(span.attributes["next.span_type"])
              ? span.attributes["next.span_type"]
              : `nextjs.${span.kind}`,
            attributes,
            status: { code: span.status.code },
            events: [],
            links: [],
            resource,
            instrumentationScope: { name: serviceName },
            spanContext: () => {
              const { traceId, spanId, traceFlags } = span.spanContext();
              return { traceId, spanId, traceFlags };
            },
            ...(span.parentSpanContext
              ? { parentSpanContext: {
                  traceId: span.parentSpanContext.traceId,
                  spanId: span.parentSpanContext.spanId,
                  traceFlags: span.parentSpanContext.traceFlags,
                } }
              : {}),
          };
        });
        exporter.export(safeSpans, callback);
      }).catch(() => callback({ code: ExportResultCode.FAILED }));
    },
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
  };
}

// Next.js spans run across async boundaries, so parent/child links need the
// AsyncLocalStorage context manager besides the provider and the propagator.
function registerGlobally(provider: TracerProvider, propagator: CompositePropagator) {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(propagator);
}

export async function registerPosthogTracing() {
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (tracerProvider) return;
  const propagator = new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new RequestCorrelationPropagator()] });
  if (!projectToken?.startsWith("phc_")) {
    tracerProvider = new TracerProvider({ sampler: new AlwaysOffSampler() });
    registerGlobally(tracerProvider, propagator);
    return;
  }
  const environment = tracingEnvironment(process.env);
  const enabled = createTracingFlagDecision(projectToken, environment);
  const exporter = createSafeTraceExporter(new OTLPTraceExporter({
    url: `${ingestionHost}/i/v1/traces`,
    headers: { Authorization: `Bearer ${projectToken}` },
    timeoutMillis: 5000,
  }), enabled, environment, process.env.SOURCE_SHA ?? process.env.K_REVISION ?? "local");
  tracerProvider = new TracerProvider({
    sampler: new TraceIdRatioBasedSampler(0.1),
    spanProcessors: [new BatchSpanProcessor({
      exporter,
      maxQueueSize: 512,
      maxExportBatchSize: 128,
      scheduledDelayMillis: 1000,
      exportTimeoutMillis: 8000,
    })],
  });
  registerGlobally(tracerProvider, propagator);
}
