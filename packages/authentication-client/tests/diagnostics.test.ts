import { afterEach, expect, test, vi } from "vitest";
import { createAuthenticationClient } from "../client";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const requestId = "ffffffff-0000-4000-8000-000000000001";
const traceparent = `00-${"a".repeat(32)}-${"b".repeat(16)}-00`;
const correlationId = "aaaaaaaaaaaaaaaa-GRU";
const remoteRoot = "bbbbbbbbbbbbbbbb-GRU";

function shortenAuthorityDeadline() {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(1));
}

test("a runtime identity preserves the incoming root on an ordinary session read", async () => {
  let observed: Headers | undefined;
  const identity = vi.fn(async () => "private-identity-sentinel");
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test", runtimeIdentityToken: identity,
    diagnostics: { context: () => ({ requestId, correlationId }), write: () => {} },
    request: async (_url, options) => {
      observed = new Headers(options?.headers);
      return Response.json({ result: { data: { status: "invalid" } } }, { headers: { "x-authentication-protocol": "1", "x-correlation-id": correlationId } });
    },
  });
  expect(await client.session("session-sentinel")).toEqual({ status: "invalid" });
  expect(identity).toHaveBeenCalledWith("https://api.test");
  expect(observed?.get("authorization")).toBe("Bearer private-identity-sentinel");
  expect(observed?.get("x-correlation-id")).toBe(correlationId);
  expect(observed?.get("cookie")).toBe("session=session-sentinel");
});

test.each(["identity_unavailable", "parent_not_retained"] as const)("correlation loss retains one unsampled event and preserves authentication (%s)", async (reason) => {
  vi.spyOn(Math, "random").mockReturnValue(0.9);
  const events: unknown[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    runtimeIdentityToken: async () => {
      if (reason === "identity_unavailable") throw new Error("private-metadata-sentinel");
      return "private-identity-sentinel";
    },
    diagnostics: { context: () => ({ requestId, correlationId }), write: event => events.push(event) },
    request: async () => Response.json({ result: { data: { status: "invalid" } } }, { headers: { "x-authentication-protocol": "1", "x-correlation-id": remoteRoot } }),
  });
  expect(await client.session("private-cookie-sentinel")).toEqual({ status: "invalid" });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ event: "authentication.client.correlation_failed", outcome: "degraded", authenticationOutcome: "completed", correlationFailure: reason, correlationId, remoteCorrelationId: remoteRoot, requestId });
  expect(JSON.stringify(events)).not.toContain("sentinel");
  expect(Buffer.byteLength(JSON.stringify(events[0]))).toBeLessThan(2048);
});

test("authentication failure and correlation loss share one retained event", async () => {
  const events: unknown[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    runtimeIdentityToken: async () => { throw new Error("private-metadata-sentinel"); },
    diagnostics: { context: () => ({ requestId, correlationId }), write: event => events.push(event) },
    request: async () => new Response(null, { status: 503, headers: { "x-authentication-protocol": "1", "x-correlation-id": remoteRoot } }),
  });
  await expect(client.session("cookie")).rejects.toThrow("Authentication authority unavailable");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ event: "authentication.client.failed", failureCategory: "http_5xx", correlationFailure: "identity_unavailable", remoteCorrelationId: remoteRoot });
  expect(JSON.stringify(events)).not.toContain("sentinel");
});

test("an explicit service proof is reused without a metadata lookup", async () => {
  const identity = vi.fn(async () => "unused");
  let authorization: string | null = null;
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test", runtimeIdentityToken: identity,
    request: async (_url, options) => {
      authorization = new Headers(options?.headers).get("authorization");
      return new Response(null, { headers: { "x-authentication-protocol": "1" } });
    },
  });
  await client.request("/api/auth/get-session", { bearer: "existing-proof" });
  expect(authorization).toBe("Bearer existing-proof");
  expect(identity).not.toHaveBeenCalled();
});

test("an unsampled caller preserves timeout evidence and propagates its trace", async () => {
  shortenAuthorityDeadline();
  const events: unknown[] = [];
  let observed: Headers | undefined;
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    diagnostics: { context: () => ({ requestId, traceparent }), write: event => events.push(event) },
    request: async (_url, options) => {
      observed = new Headers(options?.headers);
      return await new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason));
      });
    },
  });
  const failed = expect(client.session("private-session-sentinel")).rejects.toMatchObject({ name: "TimeoutError", authenticationRequestId: requestId });
  await failed;
  expect(observed?.get("traceparent")).toBe(traceparent);
  expect(events).toHaveLength(1);
  expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
  expect(events[0]).toMatchObject({ outcome: "failed", failureCategory: "timeout", requestId, traceId: "a".repeat(32), stage: "transport", deadlineMs: 5000 });
  expect(JSON.stringify(events)).not.toContain("private-session-sentinel");
});

test("a remote 5xx retains status and Worker release without reading private content", async () => {
  const events: unknown[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    diagnostics: { context: () => ({ requestId }), write: event => events.push(event) },
    request: async () => Response.json({ error: "private-body-sentinel" }, { status: 503, headers: { "x-authentication-protocol": "1", "x-authentication-release": "worker-release-1" } }),
  });
  await expect(client.session("private-cookie-sentinel")).rejects.toThrow("Authentication authority unavailable");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ failureCategory: "http_5xx", status: 503, remoteRelease: "worker-release-1", requestId });
  expect(JSON.stringify(events)).not.toContain("sentinel");
});

test("successes are sampled after the outcome while telemetry failure cannot break authentication", async () => {
  vi.spyOn(Math, "random").mockReturnValueOnce(0.9).mockReturnValueOnce(0.01);
  let calls = 0;
  const events: unknown[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    diagnostics: { context: () => ({ requestId: calls++ === 0 ? requestId : "00000000-0000-4000-8000-000000000001" }), write: (event) => {
      events.push(event);
      throw new Error("sink unavailable");
    } },
    request: async () => Response.json({ result: { data: { status: "invalid" } } }, { headers: { "x-authentication-protocol": "1" } }),
  });
  expect(await client.session("cookie")).toEqual({ status: "invalid" });
  expect(await client.session("cookie")).toEqual({ status: "invalid" });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ outcome: "completed" });
});

test.each(["invalid-json", "invalid-schema"])("a decoded response failure retains correlation instead of reporting success (%s)", async (kind) => {
  const events: unknown[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    diagnostics: { context: () => ({ requestId }), write: event => events.push(event) },
    request: async () => new Response(kind === "invalid-json" ? "private-invalid-json-sentinel" : JSON.stringify({ result: { data: { status: "unknown" } } }), { headers: { "x-authentication-protocol": "1" } }),
  });
  await expect(client.session("private-cookie-sentinel")).rejects.toMatchObject({ authenticationRequestId: requestId });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ outcome: "failed", failureCategory: "protocol", requestId, status: 200 });
  expect(JSON.stringify(events)).not.toContain("sentinel");
});

test("a timeout while consuming the response body retains the same request", async () => {
  shortenAuthorityDeadline();
  const events: unknown[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    diagnostics: { context: () => ({ requestId }), write: event => events.push(event) },
    request: async (_url, options) => new Response(new ReadableStream({
      start(controller) { options?.signal?.addEventListener("abort", () => controller.error(options.signal?.reason)); },
    }), { headers: { "x-authentication-protocol": "1" } }),
  });
  await expect(client.session("cookie")).rejects.toMatchObject({ name: "TimeoutError", authenticationRequestId: requestId });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ outcome: "failed", failureCategory: "timeout", stage: "transport", status: 200 });
});
