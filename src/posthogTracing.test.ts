import { requestCorrelationContextKey } from "@tudomacae/www-origin-routing/correlation";
import { context, createTraceState, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSafeTraceExporter, createTracingFlagDecision, registerPosthogTracing, tracingEnvironment } from "./posthogTracing";

afterEach(() => {
  vi.unstubAllEnvs();
  context.disable();
  trace.disable();
  propagation.disable();
});

describe("tracing environment", () => {
  test.each([
    [{ NODE_ENV: "production", K_SERVICE: "nextjs" }, "production"],
    [{ NODE_ENV: "production" }, "development"],
    [{ NODE_ENV: "development", K_SERVICE: "nextjs" }, "development"],
    [{ NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "test", K_SERVICE: "nextjs" }, "test"],
    [{ NODE_ENV: "test" }, "test"],
    [{ NODE_ENV: "production", NEXT_PHASE: "phase-production-build", K_SERVICE: "nextjs" }, "build"],
    [{ NODE_ENV: "production", K_SERVICE: "qualification-next", NEXT_PUBLIC_APP_ENV: "qualification" }, "qualification"],
    [{ NODE_ENV: "production", NEXT_PHASE: "phase-production-build", NEXT_PUBLIC_APP_ENV: "qualification" }, "build"],
    [{}, "development"],
  ])("classifies existing runtime signals (%j → %s)", (environment, expected) => {
    expect(tracingEnvironment(environment)).toBe(expected);
  });

  test.each(["production", "development", "test", "build", "qualification"] as const)("scopes flag evaluation to %s", async (environment) => {
    const fetchFlag = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    await createTracingFlagDecision("phc_test", environment, fetchFlag)();
    expect(JSON.parse(fetchFlag.mock.calls[0][1]?.body as string)).toEqual({
      token: "phc_test", distinct_id: "", person_properties: { environment },
    });
  });
});

describe("tracing release state", () => {
  test.each([true, false, "true", undefined])("requires a boolean true decision (%s)", async (value) => {
    const fetchFlag = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ flags: { "server-tracing": { enabled: value } } }));
    const enabled = createTracingFlagDecision("phc_test", "production", fetchFlag);
    expect(await enabled()).toBe(value === true);
    expect(await enabled()).toBe(value === true);
    expect(fetchFlag).toHaveBeenCalledOnce();
    expect(fetchFlag.mock.calls[0][0]).toBe("https://eu.i.posthog.com/flags/?v=2");
    expect(JSON.parse(fetchFlag.mock.calls[0][1]?.body as string)).toEqual({
      token: "phc_test", distinct_id: "",
      person_properties: { environment: "production" },
    });
  });

  test("rechecks cached decisions so rollback stops exports", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const fetchFlag = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ flags: { "server-tracing": { enabled: true } } }))
      .mockResolvedValueOnce(Response.json({ flags: { "server-tracing": { enabled: false } } }));
    try {
      const enabled = createTracingFlagDecision("phc_test", "production", fetchFlag);
      expect(await enabled()).toBe(true);
      now.mockReturnValue(60_001);
      expect(await enabled()).toBe(false);
      expect(fetchFlag).toHaveBeenCalledTimes(2);
    }
    finally {
      now.mockRestore();
    }
  });

  test.each(["network", "status", "malformed"])("fails closed on %s", async (failure) => {
    const fetchFlag = vi.fn<typeof fetch>();
    if (failure === "network") fetchFlag.mockRejectedValue(new Error("secret"));
    else if (failure === "status") fetchFlag.mockResolvedValue(new Response(null, { status: 503 }));
    else fetchFlag.mockResolvedValue(new Response("invalid JSON"));
    expect(await createTracingFlagDecision("phc_test", "production", fetchFlag)()).toBe(false);
  });

  test("missing project token never contacts ingestion or flags", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    const fetchFlag = vi.spyOn(globalThis, "fetch");
    await registerPosthogTracing();
    expect(fetchFlag).not.toHaveBeenCalled();
    const rootId = "8f1e2d3c4b5a6978-GRU";
    const extracted = propagation.extract(ROOT_CONTEXT, { "x-www-request-id": rootId });
    expect(extracted.getValue(requestCorrelationContextKey)).toBe(rootId);
    const span = trace.getTracer("correlation-test").startSpan("request");
    expect(span.isRecording()).toBe(false);
    span.end();
    fetchFlag.mockRestore();
  });
});

test("registers the provider without a startup flag decision and only once", async () => {
  vi.resetModules();
  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { registerPosthogTracing: registerFresh } = await import("./posthogTracing");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  const register = vi.spyOn(NodeTracerProvider.prototype, "register").mockImplementation(() => {});
  const fetchFlag = vi.spyOn(globalThis, "fetch");
  try {
    await registerFresh();
    await registerFresh();
    expect(register).toHaveBeenCalledOnce();
    expect(fetchFlag).not.toHaveBeenCalled();
  }
  finally {
    register.mockRestore();
    fetchFlag.mockRestore();
  }
});

describe("trace ingestion boundary", () => {
  test("changes ingestion on a running provider when the flag changes", async () => {
    let enabled = false;
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(createSafeTraceExporter(sink, async () => enabled, "test", "release-1"))],
    });
    const tracer = provider.getTracer("test");
    try {
      tracer.startSpan("before activation").end();
      await provider.forceFlush();
      expect(sink.getFinishedSpans()).toHaveLength(0);
      enabled = true;
      tracer.startSpan("after activation").end();
      await provider.forceFlush();
      expect(sink.getFinishedSpans()).toHaveLength(1);
      enabled = false;
      tracer.startSpan("after rollback").end();
      await provider.forceFlush();
      expect(sink.getFinishedSpans()).toHaveLength(1);
    }
    finally {
      await provider.shutdown();
    }
  });

  test.each([true, false])("sanitizes real SDK spans and respects the release decision (%s)", async (enabled) => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ "host.name": "secret" }),
      spanProcessors: [new SimpleSpanProcessor(createSafeTraceExporter(sink, async () => enabled, "test", "release-1"))],
    });
    const parent = { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1, traceState: createTraceState("private=secret") };
    const span = provider.getTracer("secret").startSpan("GET /secret?token=secret", {
      attributes: { "url.full": "secret", "http.status_code": 500, "next.span_type": "BaseServer.handleRequest" },
      links: [{ context: { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }, attributes: { private: "secret" } }],
    }, trace.setSpanContext(context.active(), parent));
    span.recordException(new Error("secret"));
    span.setStatus({ code: SpanStatusCode.ERROR, message: "secret" });
    span.end();
    await provider.forceFlush();
    const spans = sink.getFinishedSpans();
    expect(spans).toHaveLength(enabled ? 1 : 0);
    if (enabled) {
      const exported = spans[0];
      expect(exported.name).toBe("BaseServer.handleRequest");
      expect(exported.attributes).toEqual({ "http.status_code": 500 });
      expect(exported.spanContext()).toEqual({
        traceId: span.spanContext().traceId, spanId: span.spanContext().spanId, traceFlags: span.spanContext().traceFlags,
      });
      expect(exported.spanContext().traceState).toBeUndefined();
      expect(exported.parentSpanContext).toEqual({ traceId: parent.traceId, spanId: parent.spanId, traceFlags: parent.traceFlags });
      expect(exported.duration).toEqual(expect.any(Array));
      expect(JSON.stringify(exported)).not.toContain("secret");
      expect(exported.events).toEqual([]);
      expect(exported.links).toEqual([]);
      expect(exported.status).toEqual({ code: SpanStatusCode.ERROR });
      expect(exported.resource.attributes).toEqual({
        "service.name": "tudo-macae-nextjs", "deployment.environment.name": "test", "service.version": "release-1",
      });
    }
    await provider.shutdown();
  });
});
