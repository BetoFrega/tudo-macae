import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { loginPassword } = vi.hoisted(() => ({ loginPassword: vi.fn() }));
vi.mock("@/integrations/authentication/passwordLoginCommand", () => ({ loginPassword }));
import { POST } from "./route";

const headers = {
  "origin": "https://www.tudomacae.com.br",
  "host": "www.tudomacae.com.br",
  "x-forwarded-host": "www.tudomacae.com.br",
  "x-forwarded-proto": "https",
  "content-type": "application/json",
};
const request = (body: string, extra: Record<string, string> = {}) => new Request("https://origin.internal/api/autenticacao/entrar", {
  method: "POST",
  headers: { ...headers, ...extra },
  body,
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

test("uses the production package entry and sends private uncached success", async () => {
  loginPassword.mockResolvedValue({ success: true, uid: "user-1" });
  const response = await POST(request(JSON.stringify({ email: "a@example.com", password: "secret" })));
  expect(loginPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "secret" });
  expect(await response.json()).toEqual({ success: true, uid: "user-1" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});

test.each([
  [{ origin: "https://attacker.example" }],
  [{ "x-forwarded-host": "www.tudomacae.com.br,attacker.example" }],
  [{ "content-length": "1048577" }],
  [{ "content-type": "text/plain" }],
])("rejects non-origin, oversized, or non-JSON requests before login: %j", async (extra) => {
  const response = await POST(request(JSON.stringify({ email: "a@example.com", password: "secret" }), extra));
  expect([400, 403]).toContain(response.status);
  expect(loginPassword).not.toHaveBeenCalled();
});

test("returns the generic recoverable refusal without exposing input", async () => {
  loginPassword.mockResolvedValue({ success: false, error: "Erro ao entrar. Verifique seu email e senha." });
  const response = await POST(request(JSON.stringify({ email: "a@example.com", password: "secret" })));
  const result = await response.json();
  expect(result).toEqual({ success: false, error: "Erro ao entrar. Verifique seu email e senha." });
  expect(JSON.stringify(result)).not.toContain("secret");
});

test("reports unexpected package failures once with bounded sanitized correlation", async () => {
  vi.stubEnv("K_SERVICE", "test-next");
  vi.stubEnv("K_REVISION", "test-release");
  loginPassword.mockRejectedValue(new Error("private-password-provider-secret"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await POST(request(JSON.stringify({ email: "a@example.com", password: "private-password-provider-secret" }), {
    "x-auth-operation-id": "b7b16af1-5984-4a8e-b18c-337350c86e6b",
  }));
  expect(response.status).toBe(503);
  expect(response.headers.get("x-auth-error-reported")).toBe("1");
  expect(await response.json()).toEqual({ success: false, error: "Não foi possível entrar. Tente novamente." });
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
    event: "authentication.login.failed", service: "test-next", release: "test-release",
    outcome: "failed", failureCategory: "unexpected", route: "/api/autenticacao/entrar",
    statusClass: "5xx", operationId: "b7b16af1-5984-4a8e-b18c-337350c86e6b",
  });
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-password-provider-secret");
  log.mockRestore();
});
