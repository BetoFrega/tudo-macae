import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { onRequestError } from "./instrumentation";

beforeEach(() => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("GCLOUD_PROJECT", undefined);
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "macaetem-dev");
  vi.stubEnv("K_REVISION", "revision-123");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const context = { routerKind: "App Router", routePath: "/admin/categorias/[id]", routeType: "action", revalidateReason: undefined } satisfies Parameters<typeof onRequestError>[2];

test("the Next hook emits correlation and code locations without private request or exception content", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const secret = "private-input-sentinel";
  const error = Object.assign(new Error(secret), { digest: "123456", code: "ECONNRESET", stack: `Error: ${secret}\n    at save (/workspace/.next/server/chunks/server.js:12:34)\n    at ${secret} (https://private.invalid/${secret})` });
  await onRequestError(error, {
    path: `/admin/categorias/${secret}?token=${secret}`, method: "POST",
    headers: { "cookie": secret, "authorization": secret, "x-cloud-trace-context": `${"a".repeat(32)}/123;o=1`, "rsc": "1", "x-www-request-id": "8f1e2d3c4b5a6978-GRU" },
  }, context);
  expect(log).toHaveBeenCalledOnce();
  const output = String(log.mock.calls[0]?.[0]);
  expect(output).not.toContain(secret);
  expect(JSON.parse(output)).toMatchObject({
    "severity": "ERROR", "event": "next.request.error", "route": context.routePath,
    "routeType": "action", "method": "POST", "revision": "revision-123", "digest": "123456",
    "correlationId": "8f1e2d3c4b5a6978-GRU",
    "code": "ECONNRESET", "frames": [".next/server/chunks/server.js:12:34"],
    "logging.googleapis.com/trace": `projects/macaetem-dev/traces/${"a".repeat(32)}`,
  });
});

test("non-Error values and malformed correlation cannot leak arbitrary data", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await onRequestError("private-sentinel", { path: "/", method: "private-sentinel", headers: { "x-cloud-trace-context": "private-sentinel", "x-www-request-id": "private-sentinel" } }, context);
  expect(String(log.mock.calls[0]?.[0])).not.toContain("private-sentinel");
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ method: "other", frames: [] });
});

test("the hook does not import Node diagnostics in Edge", async () => {
  vi.stubEnv("NEXT_RUNTIME", "edge");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await onRequestError(new Error("ignored"), { path: "/", method: "GET", headers: {} }, context);
  expect(log).not.toHaveBeenCalled();
});

test("Next request failure retains the outbound authentication ID for joining provider records", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const authenticationRequestId = "ffffffff-0000-4000-8000-000000000001";
  await onRequestError(Object.assign(new Error("safe failure"), { authenticationRequestId }), { path: "/", method: "GET", headers: {} }, context);
  expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ authenticationRequestId });
});
