import { RequestCorrelationPropagator, requestCorrelationContextKey } from "@tudomacae/www-origin-routing/correlation";
import { createWwwOriginRouter } from "@tudomacae/www-origin-routing/router";
import { afterEach, expect, test, vi } from "vitest";
import { context, propagation, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { configuredAuthenticationClient } from "../server";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  propagation.disable();
  context.disable();
  trace.disable();
});

test("SSR calls join the active Next trace even when that trace is unsampled", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "https://api.test");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.test");
  vi.stubEnv("AUTHENTICATION_DIAGNOSTICS_ENABLED", "true");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
  const provider = new NodeTracerProvider();
  provider.register();
  const traceId = "a".repeat(32);
  const spanId = "b".repeat(16);
  try {
    await context.with(trace.setSpanContext(context.active(), { traceId, spanId, traceFlags: 0 }), async () => {
      await expect(configuredAuthenticationClient().session("private-cookie-sentinel")).rejects.toThrow("Authentication authority unavailable");
    });
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0][0])).toBe("https://api.test/api/trpc/session?input=null");
    expect(new Headers(request.mock.calls[0][1]?.headers).get("traceparent")).toBe(`00-${traceId}-${spanId}-00`);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ traceId, parentSpanId: spanId, failureCategory: "http_5xx" });
    expect(String(log.mock.calls[0][0])).not.toContain("private-cookie-sentinel");
  }
  finally { await provider.shutdown(); }
});

async function settlesWithin(call: Promise<unknown>, milliseconds: number): Promise<"completed" | "timed-out"> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    call.then(() => "completed" as const),
    new Promise<"timed-out">((resolve) => {
      timeoutId = setTimeout(() => resolve("timed-out"), milliseconds);
    }),
  ]);
  clearTimeout(timeoutId);
  return outcome;
}

function expectCorrelationFailure(call: unknown[] | undefined, correlationFailure: string) {
  expect(JSON.parse(String(call?.[0]))).toMatchObject({
    event: "authentication.client.correlation_failed",
    outcome: "degraded",
    severity: "ERROR",
    correlationFailure,
  });
}

test("Cloud Run SSR fails open while identity warms, then attaches cached identity and correlation", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "https://api.test");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.test");
  vi.stubEnv("AUTHENTICATION_DIAGNOSTICS_ENABLED", "true");
  vi.stubEnv("K_SERVICE", "www-production");
  const correlationId = "8f1e2d3c-4b5a-4978-8a9b-123456789abc";
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 120 }))
    .replace(/=/gu, "").replace(/\+/gu, "-").replace(/\//gu, "_");
  const token = `header.${payload}.signature`;
  const metadataRequests: { url: URL; headers: Headers }[] = [];
  const requests: { url: string; headers: Headers }[] = [];
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "log").mockImplementation(() => {});
  let finishMetadata!: (response: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.startsWith("http://metadata.google.internal/")) {
      metadataRequests.push({ url: new URL(url), headers: new Headers(options?.headers) });
      return new Promise<Response>((resolve) => {
        finishMetadata = resolve;
      });
    }
    requests.push({ url, headers: new Headers(options?.headers) });
    return new Response(null, { status: 401, headers: { "x-authentication-protocol": "1" } });
  });
  const provider = new NodeTracerProvider();
  provider.register();
  try {
    const publicCall = () => context.with(context.active().setValue(requestCorrelationContextKey, correlationId), async () => {
      await expect(configuredAuthenticationClient().session("session-fixture"))
        .rejects.toThrow("Authentication operation refused");
    });
    expect(await settlesWithin(publicCall(), 100)).toBe("completed");
    expect(metadataRequests).toHaveLength(1);
    expect(metadataRequests[0]?.url.searchParams.get("audience")).toBe("https://api.test");
    expect(metadataRequests[0]?.headers.get("Metadata-Flavor")).toBe("Google");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.has("authorization")).toBe(false);
    expect(requests[0]?.headers.get("x-correlation-id")).toBe(correlationId);
    finishMetadata(new Response(token));
    await new Promise(resolve => setTimeout(resolve, 0));
    await publicCall();
    expect(metadataRequests).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe("https://api.test/api/trpc/session?input=null");
    expect(requests[1]?.headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(requests[1]?.headers.get("x-correlation-id")).toBe(correlationId);
    expectCorrelationFailure(errors.mock.calls[0], "identity_unavailable");
    expectCorrelationFailure(errors.mock.calls[1], "parent_not_retained");
    expect(info).not.toHaveBeenCalled();
  }
  finally { await provider.shutdown(); }
});

test("concurrent edge requests retain their roots across multiple SSR API calls without mixing context", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "https://api.test");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.test");
  vi.stubEnv("AUTHENTICATION_DIAGNOSTICS_ENABLED", "true");
  const events: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation(line => events.push(JSON.parse(String(line))));
  const ids = ["8f1e2d3c4b5a6978-GRU", "8f1e2d3c4b5a6979-GRU"];
  const outgoing: Headers[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    outgoing.push(new Headers(options?.headers));
    await Promise.resolve();
    return new Response(null, { status: 503 });
  });
  const provider = new NodeTracerProvider();
  provider.register({ propagator: new RequestCorrelationPropagator() });
  const router = createWwwOriginRouter({
    log() {},
    async fetchWebWorker(incoming) {
      const extracted = propagation.extract(ROOT_CONTEXT, incoming.headers, { keys: carrier => [...carrier.keys()], get: (carrier, key) => carrier.get(key) ?? undefined });
      return context.with(extracted, async () => {
        const client = configuredAuthenticationClient();
        await expect(client.session("private-cookie-sentinel")).rejects.toThrow();
        await expect(client.procedure("account", null)).rejects.toThrow();
        return new Response(null, { status: 503 });
      });
    },
  });
  try {
    await Promise.all(ids.map(id => router.fetch(new Request("https://www.tudomacae.com.br/", { headers: { "cf-ray": id, "x-www-request-id": "forged-browser-sentinel", "x-correlation-id": "ffffffff-0000-4000-8000-000000000001" } }))));
    expect(outgoing).toHaveLength(4);
    for (const id of ids) expect(outgoing.filter(headers => headers.get("x-correlation-id") === id)).toHaveLength(2);
    expect(new Set(outgoing.map(headers => headers.get("x-request-id"))).size).toBe(4);
    expect(events).toHaveLength(4);
    for (const id of ids) expect(events.filter(event => (event as { correlationId: string }).correlationId === id)).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain("sentinel");
  }
  finally { await provider.shutdown(); }
});
