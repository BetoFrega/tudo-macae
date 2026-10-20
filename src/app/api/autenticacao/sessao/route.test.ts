import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { resolveSession, deleteCookie } = vi.hoisted(() => ({ resolveSession: vi.fn(), deleteCookie: vi.fn() }));
vi.mock("@/integrations/authentication/session", () => ({
  resolveSession,
  createSessionSynchronizer: (dependencies: { resolve: typeof resolveSession; clearInvalidCookies: () => Promise<void> }) => ({
    async synchronize(cookie: string | undefined) {
      const session = await dependencies.resolve(cookie);
      if (session.status === "invalid") await dependencies.clearInvalidCookies();
      return session.status === "valid" ? session.user : null;
    },
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session-cookie" }), delete: deleteCookie }) }));
import { GET, POST } from "./route";

const operationId = "b7b16af1-5984-4a8e-b18c-337350c86e6b";
const request = () => new Request("https://example.com/api/autenticacao/sessao", { headers: { "x-session-operation-id": operationId } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("K_SERVICE", "test-next");
  vi.stubEnv("K_REVISION", "test-release");
});
afterEach(() => vi.unstubAllEnvs());

test.each(["missing", "invalid"])("returns uncached anonymous data for a %s session", async (status) => {
  resolveSession.mockResolvedValue({ status });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(deleteCookie.mock.calls).toEqual(status === "invalid" ? [["session"], ["verification-refresh"]] : []);
});
test("returns current identity and roles without removing a valid cookie", async () => {
  const user = { uid: "u1", emailVerified: true, isAdmin: true, isEditor: false };
  resolveSession.mockResolvedValue({ status: "valid", user });
  const response = await GET(request());
  expect(await response.json()).toEqual(user);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(resolveSession).toHaveBeenCalledWith("session-cookie");
  expect(deleteCookie).not.toHaveBeenCalled();
});
test.each([
  [new Error("private-cookie-and-token"), "unexpected"],
  [new TypeError("private-cookie-and-token"), "type_error"],
  [new SyntaxError("private-cookie-and-token"), "syntax_error"],
])("sanitizes and correlates failure category %s", async (error, failureCategory) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  resolveSession.mockRejectedValue(error);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("x-session-error-reported")).toBe("1");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: "Não foi possível sincronizar a sessão." });
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
    event: "authentication.session.synchronize_failed", service: "test-next", environment: "test", release: "test-release",
    outcome: "failed", failureCategory, operationId, route: "/api/autenticacao/sessao", statusClass: "5xx",
  });
  expect(log.mock.calls).toHaveLength(1);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-cookie-and-token");
  log.mockRestore();
});

const postRequest = (headers: Record<string, string> = {}) => new Request("https://origin.internal/api/autenticacao/sessao", {
  method: "POST",
  headers: {
    "origin": "https://www.tudomacae.com.br",
    "host": "www.tudomacae.com.br",
    "x-forwarded-host": "www.tudomacae.com.br",
    "x-forwarded-proto": "https",
    ...headers,
  },
});

test("POST synchronizes and applies invalid-cookie removal through a same-origin mutation", async () => {
  resolveSession.mockResolvedValue({ status: "invalid" });
  const response = await POST(postRequest({ "x-session-operation-id": operationId }));
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
  expect(deleteCookie.mock.calls).toEqual([["session"], ["verification-refresh"]]);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});

test.each([
  [{ origin: "https://attacker.example" }],
  [{ "origin": "https://www.tudomacae.com.br", "x-forwarded-host": "www.tudomacae.com.br,attacker.example" }],
  [{ "origin": "https://www.tudomacae.com.br", "content-length": "1" }],
])("rejects an invalid session mutation before reading cookies: %j", async (headers) => {
  const response = await POST(postRequest(headers));
  expect(response.status).toBe(403);
  expect(resolveSession).not.toHaveBeenCalled();
});

test("qualification session failures keep their deployment scope and bounded diagnostics", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "qualification");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    resolveSession.mockRejectedValue(new Error("private-session"));
    expect((await GET(request())).status).toBe(503);
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ environment: "qualification", operationId });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-session");
  }
  finally { log.mockRestore(); }
});
