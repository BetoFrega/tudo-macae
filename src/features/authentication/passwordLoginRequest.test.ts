import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture } }));

import { loginWithPasswordRequest } from "./passwordLoginRequest";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each([
  ["network failure", async () => { throw new Error("private network response"); }, "transport"],
  ["unreadable response", async () => new Response("not-json"), "response_decode"],
  ["invalid response shape", async () => Response.json({ unexpected: true }), "invalid_response"],
])("reports a sanitized login %s", async (_case, fetchImplementation, failureCategory) => {
  vi.stubGlobal("fetch", vi.fn(fetchImplementation));
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(await loginWithPasswordRequest({ email: "private@example.com", password: "private-password" }))
    .toEqual({ success: false, error: "Não foi possível entrar. Tente novamente." });

  expect(log).toHaveBeenCalledTimes(1);
  const failure = JSON.parse(log.mock.calls[0][0]);
  expect(failure).toMatchObject({
    event: "authentication.login.request_failed",
    service: "browser",
    outcome: "failed",
    failureCategory,
    operationId: expect.stringMatching(/^[a-f0-9-]{36}$/u),
    route: "/api/autenticacao/entrar",
  });
  expect(capture).toHaveBeenCalledExactlyOnceWith("authentication_login_request_failed", failure);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.com");
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-password");
  expect(JSON.stringify(log.mock.calls)).not.toContain("private network response");
  log.mockRestore();
});

test.each([
  ["unreadable JSON", "not-json"],
  ["missing error string", JSON.stringify({ success: false })],
])("does not duplicate a route-reported login failure (%s)", async (_case, body) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
    status: 503,
    headers: { "x-auth-error-reported": "1" },
  })));
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(await loginWithPasswordRequest({ email: "a@example.com", password: "x" }))
    .toEqual({ success: false, error: "Não foi possível entrar. Tente novamente." });
  expect(log).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  log.mockRestore();
});

test.each([
  ["missing error string", { success: false }],
  ["non-string error", { success: false, error: 42 }],
])("reports an invalid refusal response without changing the generic result (%s)", async (_case, body) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(await loginWithPasswordRequest({ email: "a@example.com", password: "x" }))
    .toEqual({ success: false, error: "Não foi possível entrar. Tente novamente." });
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ failureCategory: "invalid_response" });
  expect(log).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

test("reports an unmarked intermediary 503 and leaves credential refusal unreported", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response("not-json", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ success: false, error: "Credenciais inválidas." }));
  vi.stubGlobal("fetch", fetchMock);

  expect(await loginWithPasswordRequest({ email: "a@example.com", password: "x" }))
    .toEqual({ success: false, error: "Não foi possível entrar. Tente novamente." });
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ failureCategory: "response_decode" });
  expect(await loginWithPasswordRequest({ email: "a@example.com", password: "x" }))
    .toEqual({ success: false, error: "Credenciais inválidas." });
  expect(log).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

test("qualification transport failures remain distinct from production analytics", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "qualification");
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("private");
  }));
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await loginWithPasswordRequest({ email: "private@example.com", password: "private" });
    expect(capture.mock.calls[0]![1]).toMatchObject({ environment: "qualification" });
    expect(JSON.stringify(capture.mock.calls)).not.toContain("private");
  }
  finally { log.mockRestore(); }
});
