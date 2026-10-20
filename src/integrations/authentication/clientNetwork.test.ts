import { afterEach, expect, test, vi } from "vitest";
import { authenticationNetworkHeaders } from "./clientNetwork";
const ports = vi.hoisted(() => ({ token: vi.fn(), headers: vi.fn() }));
vi.mock("@tudomacae/authentication-client/server", () => ({ serviceIdentityToken: ports.token }));
vi.mock("next/headers", () => ({ headers: ports.headers }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function production() {
  vi.stubEnv("K_SERVICE", "tudo-macae-web");
  vi.stubEnv("AUTHENTICATION_API_URL", "https://api.test");
  ports.token.mockResolvedValue("disposable-oidc");
}
test("uses the edge address and runtime identity, discarding browser assertions", async () => {
  production();
  const result = await authenticationNetworkHeaders(new Headers({
    "cf-connecting-ip": "203.0.113.4", "x-authentication-client-ip": "203.0.113.99",
    "x-forwarded-for": "203.0.113.98", "authorization": "Bearer browser-forged",
  }));
  expect(result.get("x-authentication-client-ip")).toBe("203.0.113.4");
  expect(result.get("authorization")).toBe("Bearer disposable-oidc");
  expect(ports.token).toHaveBeenCalledWith("https://api.test");
  expect(result.has("x-forwarded-for")).toBe(false);
});
test("server actions read the current request and refuse missing or malformed edge addresses", async () => {
  production();
  ports.headers.mockResolvedValue(new Headers({ "cf-connecting-ip": "2001:db8::4" }));
  expect((await authenticationNetworkHeaders()).get("x-authentication-client-ip")).toBe("2001:db8::4");
  ports.token.mockClear();
  await expect(authenticationNetworkHeaders(new Headers())).rejects.toThrow();
  await expect(authenticationNetworkHeaders(new Headers({ "cf-connecting-ip": "spoofed" }))).rejects.toThrow();
  expect(ports.token).not.toHaveBeenCalled();
});
test("deployed Cloud Run forwards without declaring an app environment", async () => {
  production();
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", undefined);
  expect((await authenticationNetworkHeaders(new Headers({ "cf-connecting-ip": "203.0.113.4" }))).get("x-authentication-client-ip")).toBe("203.0.113.4");
});
test("the deployed web Worker forwards without Cloud Run", async () => {
  production();
  vi.stubEnv("K_SERVICE", undefined);
  vi.stubEnv("FORWARD_CLIENT_ADDRESS", "1");
  const result = await authenticationNetworkHeaders(new Headers({ "cf-connecting-ip": "203.0.113.4" }));
  expect(result.get("x-authentication-client-ip")).toBe("203.0.113.4");
  expect(ports.token).toHaveBeenCalledWith("https://api.test");
});
test("disposable local environments do not request Google runtime credentials", async () => {
  vi.stubEnv("K_SERVICE", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
  expect([...(await authenticationNetworkHeaders()).entries()]).toEqual([]);
  expect(ports.token).not.toHaveBeenCalled();
});
