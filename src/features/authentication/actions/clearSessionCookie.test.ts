import { afterEach, expect, test, vi } from "vitest";
import { clearSessionCookie } from "./clearSessionCookie";
const ports = vi.hoisted(() => ({ request: vi.fn(), remove: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: "private-session" }),
    delete: ports.remove,
  }),
}));
vi.mock("@tudomacae/authentication-client/server", () => ({
  configuredAuthenticationClient: () => ({ request: ports.request }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test.each(["test", "qualification"])("a refused remote logout retains the session and reports private diagnostics in %s", async (environment) => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", environment);
  vi.stubEnv("K_SERVICE", undefined);
  vi.stubEnv("K_REVISION", undefined);
  vi.stubEnv("GITHUB_SHA", "ci-test-source-sha");
  ports.request.mockResolvedValue(new Response(null, { status: 403 }));
  const reported = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  expect(await clearSessionCookie()).toMatchObject({ success: false });
  expect(ports.remove).not.toHaveBeenCalled();
  const [path, options] = ports.request.mock.calls[0];
  expect(path).toBe("/api/auth/sign-out");
  const event = JSON.parse(reported.mock.calls[0][0]);
  expect(event).toMatchObject({
    event: "authentication.logout.failed",
    service: "next",
    environment,
    release: "ci-test-source-sha",
    outcome: "failed",
    route: path,
    statusClass: "4xx",
  });
  expect(event.requestId).toBe(options.headers.get("x-request-id"));
  expect(event.requestId).toMatch(/^[a-f\d-]{36}$/i);
  expect(JSON.stringify(event)).not.toContain("private-session");
});
