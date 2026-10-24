import { afterEach, expect, test, vi } from "vitest";
import { authenticationTraceParent, createAuthenticationDiagnostics, type AuthenticationDiagnosticEvent } from "../diagnostics";

test("a pending failure records bounded stage times once, without retaining URL or unsafe context", async () => {
  let clock = 0;
  const events: AuthenticationDiagnosticEvent[] = [];
  const recorder = createAuthenticationDiagnostics({
    service: "api-worker", requestId: "ffffffff-0000-4000-8000-000000000001",
    traceparent: "private-trace-sentinel", path: "/api/trpc/session?token=private-query-sentinel",
    environment: "private-environment@sentinel", release: "https://private-release-sentinel",
    now: () => clock, write: event => events.push(event),
  });
  await recorder.run("runtime_identity", async () => {
    clock = 12;
  });
  recorder.start("handler");
  clock = 5000;
  recorder.deadline();
  recorder.fail("dependency", 503);
  recorder.complete(200);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ environment: "unknown", release: "unknown", durationMs: 5000, stage: "handler", outcome: "failed" });
  expect(events[0].stages).toEqual([
    { stage: "runtime_identity", durationMs: 12, outcome: "completed" },
    { stage: "handler", durationMs: 4988, outcome: "pending" },
  ]);
  expect(JSON.stringify(events)).not.toContain("sentinel");
  expect(Buffer.byteLength(JSON.stringify(events[0]))).toBeLessThan(2048);
});

test.each([
  `00-${"0".repeat(32)}-${"b".repeat(16)}-01`,
  `00-${"a".repeat(32)}-${"0".repeat(16)}-01`,
  "private-trace-sentinel",
])("invalid W3C context is discarded (%s)", (parent) => {
  expect(authenticationTraceParent(parent)).toBeUndefined();
});

test("parallel identity proof preserves pending handler evidence and freezes an emitted root", async () => {
  let clock = 0;
  const events: AuthenticationDiagnosticEvent[] = [];
  const root = "aaaaaaaaaaaaaaaa-GRU";
  const recorder = createAuthenticationDiagnostics({ service: "api-worker", requestId: "ffffffff-0000-4000-8000-000000000001", correlationId: root, path: "/api/trpc/session", now: () => clock, write: event => events.push(event) });
  let finishProof!: () => void;
  const proof = recorder.run("runtime_identity", () => new Promise<void>((resolve) => {
    finishProof = resolve;
  }));
  let finishHandler!: () => void;
  const handler = recorder.run("handler", () => new Promise<void>((resolve) => {
    finishHandler = resolve;
  }));
  clock = 100;
  finishProof();
  await proof;
  clock = 5000;
  recorder.deadline();
  expect(recorder.correlate("bbbbbbbbbbbbbbbb-GRU")).toBe(false);
  finishHandler();
  await handler;
  recorder.complete(200);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ correlationId: root, stage: "handler", stages: [
    { stage: "runtime_identity", durationMs: 100, outcome: "completed" },
    { stage: "handler", durationMs: 5000, outcome: "pending" },
  ] });
});

afterEach(() => vi.restoreAllMocks());
test("caller-selected identifiers cannot select the success cohort", () => {
  vi.spyOn(Math, "random").mockReturnValueOnce(0.9).mockReturnValueOnce(0.01);
  const events: unknown[] = [];
  for (const requestId of ["00000000-0000-4000-8000-000000000001", "ffffffff-0000-4000-8000-000000000002"]) {
    createAuthenticationDiagnostics({ service: "api-worker", requestId, path: "/api/trpc/session", now: () => 0, write: event => events.push(event) }).complete(200);
  }
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ requestId: "ffffffff-0000-4000-8000-000000000002", outcome: "completed" });
});
