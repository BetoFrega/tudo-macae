import { afterAll, beforeAll, expect, test } from "vitest";
import { Miniflare } from "miniflare";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthenticationClient } from "@tudomacae/authentication-client/client";
import type { AuthenticationDiagnosticEvent } from "@tudomacae/authentication/diagnostics";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

let runtime: Miniflare;
let directory: string;
let serviceToken: string;
const traceId = "a".repeat(32);
const traceparent = `00-${traceId}-${"b".repeat(16)}-00`;
const requestId = "ffffffff-0000-4000-8000-000000000001";
beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  serviceToken = await new SignJWT({ email: "runtime@test.iam.gserviceaccount.com", email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: "diagnostics-test" })
    .setIssuer("https://accounts.google.com")
    .setAudience("https://authentication.test")
    .setSubject("diagnostics-runtime")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  directory = await mkdtemp(join(tmpdir(), "authentication-diagnostics-"));
  execFileSync("pnpm", ["--filter", "@tudomacae/api-worker", "run", "build", "--entry", "tests/diagnosticsFixtureWorker.ts", "--outdir", directory], { stdio: "pipe" });
  const bundle = (await readdir(directory)).find(name => name.endsWith(".js"));
  if (!bundle) throw new Error("Diagnostic fixture bundle missing");
  runtime = new Miniflare({
    workers: [{ config: {
      name: "diagnostics-test", compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
      manifest: { mainModule: bundle, modules: { [bundle]: { type: "esm", contents: await readFile(join(directory, bundle), "utf8") } }, modulesRoot: directory },
      env: { AUTHENTICATION_DB: { type: "d1", id: "diagnostics-authentication" }, CLASSIFIEDS_DB: { type: "d1", id: "diagnostics-classifieds" },
        WORKERS_ENVIRONMENT: { type: "json", value: "qualification" },
        AUTHENTICATION_DIAGNOSTICS_ENABLED: { type: "json", value: "true" },
        PUBLIC_APP_ORIGIN: { type: "json", value: "https://www.test" },
        BETTER_AUTH_SECRET: { type: "json", value: "fixture-only-authentication-diagnostics-key" },
        TEST_SERVICE_KEYS: { type: "json", value: { keys: [{ ...(await exportJWK(publicKey)), kid: "diagnostics-test", alg: "RS256" }] } },
        OIDC_AUDIENCE: { type: "json", value: "https://authentication.test" },
        OIDC_SERVICE_ACCOUNT: { type: "json", value: "runtime@test.iam.gserviceaccount.com" },
      },
    } }],
  });
  const database = await runtime.getD1Database("AUTHENTICATION_DB");
  for (const file of (await readdir(join(directory, "migrations"))).filter(file => file.endsWith(".sql")).sort()) {
    await database.exec(await readFile(join(directory, "migrations", file), "utf8"));
  }
  const classifieds = await runtime.getD1Database("CLASSIFIEDS_DB");
  for (const file of (await readdir(join(directory, "migrations-classifieds"))).filter(file => file.endsWith(".sql")).sort()) {
    await classifieds.exec(await readFile(join(directory, "migrations-classifieds", file), "utf8"));
  }
});
afterAll(async () => {
  await runtime?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function readEvents() {
  const response = await runtime.dispatchFetch("https://authentication.test/__diagnostics");
  return await response.json() as AuthenticationDiagnosticEvent[];
}
function signIn(fault: string) {
  return runtime.dispatchFetch("https://authentication.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "https://www.test", "x-fixture-fault": fault, "x-request-id": requestId, "x-correlation-id": "8f1e2d3c4b5a6978-GRU", "cf-ray": "0123456789abcdef-GRU", "authorization": `Bearer ${serviceToken}`, traceparent, "x-authentication-protocol": "1" },
    body: JSON.stringify({ email: "private-email-sentinel@example.com", password: "private-password-sentinel" }),
  });
}

test("an unsampled database failure identifies its dependency and returned correlation", async () => {
  const response = await signIn("database");
  expect(response.status).toBeGreaterThanOrEqual(500);
  expect(response.headers.get("x-request-id")).toBe(requestId);
  const events = await readEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ requestId, traceId, correlationId: response.headers.get("x-correlation-id"), stage: "handler", outcome: "failed", failureCategory: "dependency" });
  expect(events[0].stages).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: "runtime_identity" }),
  ]));
  expect(JSON.stringify(events)).not.toContain("sentinel");
});

test.each(["on", "off"])("public sessions return immediately with diagnostics %s while optional JWT keys are delayed or hung", async (mode) => {
  for (const fault of ["runtime_identity_delayed", "runtime_identity_hung"]) {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    let response;
    try {
      response = await Promise.race([
        runtime.dispatchFetch("https://authentication.test/api/trpc/session", {
          headers: { "x-fixture-fault": fault, "x-fixture-diagnostics": mode, "x-request-id": requestId,
            "x-correlation-id": "8f1e2d3c4b5a6978-GRU", "cf-ray": "0123456789abcdef-GRU", "authorization": `Bearer ${serviceToken}`,
          },
        }),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Optional proof blocked a public session")), 1000); }),
      ]);
    }
    finally { clearTimeout(deadline); }
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { data: { status: "missing" } } });
    expect(response.headers.get("x-correlation-id")).toBe("0123456789abcdef-GRU");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("x-fixture-keep-alive-jobs")).toBe("2");
    const events = await readEvents();
    expect(events).toHaveLength(mode === "on" ? 1 : 0);
    if (mode === "on") {
      expect(events[0]).toMatchObject({ outcome: "completed", correlationId: "0123456789abcdef-GRU" });
      expect(events[0].stages).toEqual(expect.arrayContaining([expect.objectContaining({ stage: "runtime_identity", outcome: "pending" })]));
    }
    if (fault === "runtime_identity_delayed") {
      await new Promise(resolve => setTimeout(resolve, 5700));
      expect(response.headers.get("x-correlation-id")).toBe("0123456789abcdef-GRU");
      expect(await readEvents()).toHaveLength(0);
    }
  }
}, 10000);

test("a mandatory identity check keeps pending stages and freezes the root once its watchdog emits", async () => {
  const pending = runtime.dispatchFetch("https://authentication.test/internal/identities/missing", {
    method: "POST",
    headers: { "x-fixture-fault": "runtime_identity_delayed", "x-request-id": requestId,
      "x-correlation-id": "8f1e2d3c4b5a6978-GRU", "cf-ray": "0123456789abcdef-GRU", "authorization": `Bearer ${serviceToken}`,
    },
  });
  await new Promise(resolve => setTimeout(resolve, 5100));
  const events = await readEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ outcome: "failed", failureCategory: "timeout", stage: "handler", correlationId: "0123456789abcdef-GRU" });
  expect(events[0].stages).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: "runtime_identity", outcome: "pending" }),
    expect.objectContaining({ stage: "handler", outcome: "pending" }),
  ]));
  const response = await pending;
  expect(response.status).toBe(405);
  expect(response.headers.get("x-correlation-id")).toBe("0123456789abcdef-GRU");
  expect(await readEvents()).toHaveLength(0);
}, 8000);

test("optional runtime proof adds no keep-alive job or authentication watchdog to Classifieds", async () => {
  const response = await runtime.dispatchFetch("https://authentication.test/api/trpc/classifiedsUnknownProcedure", {
    headers: { "x-fixture-fault": "runtime_identity_hung", "x-request-id": requestId,
      "x-correlation-id": "8f1e2d3c4b5a6978-GRU", "cf-ray": "0123456789abcdef-GRU", "authorization": `Bearer ${serviceToken}`,
    },
  });
  expect(response.status).toBe(404);
  expect(response.headers.get("x-correlation-id")).toBe("0123456789abcdef-GRU");
  expect(response.headers.get("x-fixture-keep-alive-jobs")).toBe("1");
  expect(await readEvents()).toHaveLength(0);
});

test("parent correlation and privileged identity/IP checks share one JWT verification per invocation", async () => {
  await runtime.dispatchFetch("https://authentication.test/__identity-verifications");
  for (const [path, method, forwardedIp, status] of [
    ["/internal/identities/missing", "POST", undefined, 405],
    ["/api/trpc/diagnosticUnknownProcedure", "GET", "198.51.100.2", 404],
  ] as const) {
    const response = await runtime.dispatchFetch(`https://authentication.test${path}`, {
      method,
      headers: { "authorization": `Bearer ${serviceToken}`, "x-correlation-id": "8f1e2d3c4b5a6978-GRU",
        ...(forwardedIp ? { "x-authentication-client-ip": forwardedIp } : {}),
      },
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("x-correlation-id")).toBe("8f1e2d3c4b5a6978-GRU");
    const verifications = await runtime.dispatchFetch("https://authentication.test/__identity-verifications");
    expect(await verifications.json()).toEqual({ count: 1 });
    await readEvents();
  }
});

test("Worker deadline evidence survives a caller timeout and identifies the still-pending handler", async () => {
  const clientEvents: AuthenticationDiagnosticEvent[] = [];
  const client = createAuthenticationClient({
    origin: "https://authentication.test", publicOrigin: "https://www.test",
    diagnostics: { context: () => ({ requestId, traceparent, correlationId: "8f1e2d3c4b5a6978-GRU" }), write: event => clientEvents.push(event) },
    request: async (_url, options) => {
      const pending = signIn("database_timeout");
      // Miniflare dispatch does not implement Fetch's signal cancellation.
      return await new Promise<Response>((resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        void pending.then(async response => new Response(await response.text(), { status: response.status, headers: Object.fromEntries(response.headers.entries()) })).then(resolve, reject);
      });
    },
  });
  await expect(client.request("/api/auth/sign-in/email")).rejects.toMatchObject({ name: "TimeoutError" });
  expect(clientEvents).toHaveLength(1);
  await new Promise(resolve => setTimeout(resolve, 100));
  const events = await readEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ outcome: "failed", stage: "handler", failureCategory: "timeout", requestId, traceId, correlationId: "8f1e2d3c4b5a6978-GRU" });
  expect(events[0].stages).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: "handler", outcome: "pending" }),
  ]));
  await new Promise(resolve => setTimeout(resolve, 600));
  expect(await readEvents()).toHaveLength(0);
}, 8000);
