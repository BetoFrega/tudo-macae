import { afterAll, afterEach, expect, test, vi } from "vitest";
vi.stubEnv("AUTHENTICATION_API_URL", "https://authentication.test");
vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.tudomacae.com.br");
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), delete: vi.fn() }), headers: async () => new Headers() }));
vi.mock("@/lib/appEnv", () => ({ allowsTestAffordances: () => true }));
const { POST } = await import("./route");

afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  vi.unstubAllEnvs();
});

test("lets an unexpected provider failure from the real package entry reach the sanitized HTTP boundary", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private upstream detail", { status: 503 })));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await POST(new Request("https://origin.internal/api/autenticacao/entrar", {
    method: "POST",
    headers: {
      "origin": "https://www.tudomacae.com.br",
      "host": "www.tudomacae.com.br",
      "x-forwarded-host": "www.tudomacae.com.br",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: "test@example.com", password: "fixture-password" }),
  }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ success: false, error: "Não foi possível entrar. Tente novamente." });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private upstream detail");
  expect(JSON.stringify(log.mock.calls)).not.toContain("fixture-password");
  log.mockRestore();
});
