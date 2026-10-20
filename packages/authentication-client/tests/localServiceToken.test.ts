import { afterEach, expect, test, vi } from "vitest";
import { serviceIdentityToken } from "../server";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test.each([
  ["the test build", { NEXT_PUBLIC_APP_ENV: "test", NODE_ENV: "production" }],
  ["next dev", { NEXT_PUBLIC_APP_ENV: "", NODE_ENV: "development" }],
])("%s presents the fixture token to a loopback Worker", async (_, environment) => {
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  vi.stubEnv("AUTHENTICATION_TEST_SERVICE_TOKEN", "fixture-token");
  expect(await serviceIdentityToken("http://127.0.0.1:8787")).toBe("fixture-token");
});

test("a production runtime never presents the fixture token, even to loopback", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTHENTICATION_TEST_SERVICE_TOKEN", "fixture-token");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("metadata server unreachable"));
  await expect(serviceIdentityToken("http://127.0.0.1:8787")).rejects.toThrow();
});

test("next dev never presents the fixture token to a remote Worker", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTHENTICATION_TEST_SERVICE_TOKEN", "fixture-token");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("metadata server unreachable"));
  await expect(serviceIdentityToken("https://api.tudomacae.com.br")).rejects.toThrow();
});
