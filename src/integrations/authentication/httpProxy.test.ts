import { afterEach, expect, test, vi } from "vitest";
import { proxyAuthenticationRequest } from "./httpProxy";
const ports = vi.hoisted(() => ({ network: vi.fn(), request: vi.fn() }));
vi.mock("./clientNetwork", () => ({ authenticationNetworkHeaders: ports.network }));
vi.mock("@tudomacae/authentication-client/server", () => ({ configuredAuthenticationClient: () => ({ request: ports.request }) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
test("reports pre-Worker forwarding failures once with private correlation and no sensitive details", async () => {
  ports.network.mockRejectedValue(new Error("private-token-and-ip"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await proxyAuthenticationRequest(new Request("https://www.test/api/auth/get-session?token=private-query", {
    headers: { "x-request-id": "f49cbdfe-c571-4e83-bbd6-90a06fbe0001" },
  }));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-request-id")).toBe("f49cbdfe-c571-4e83-bbd6-90a06fbe0001");
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
    event: "authentication.proxy.failed", route: "/api/auth/:operation",
    requestId: response.headers.get("x-request-id"), outcome: "failed", statusClass: "5xx",
  });
  expect(log.mock.calls[0][0]).not.toContain("private-");
  expect(ports.request).not.toHaveBeenCalled();
});

test("forwards Worker unavailability without duplicating operational errors", async () => {
  ports.network.mockResolvedValue(new Headers());
  ports.request.mockResolvedValue(Response.json({ error: "Unavailable" }, {
    status: 503, headers: { "x-authentication-protocol": "1", "x-request-id": "f49cbdfe-c571-4e83-bbd6-90a06fbe0002" },
  }));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await proxyAuthenticationRequest(new Request("https://www.test/api/auth/get-session"));
  expect(response.status).toBe(503);
  expect(response.headers.get("x-request-id")).toBe("f49cbdfe-c571-4e83-bbd6-90a06fbe0002");
  expect(log).not.toHaveBeenCalled();
  expect(ports.request).toHaveBeenCalledWith("/api/auth/get-session", expect.objectContaining({ forwardUnavailable: true }));
});

test("forwards immutable upstream headers without turning the response into a proxy failure", async () => {
  ports.network.mockResolvedValue(new Headers());
  const upstream = Response.redirect("https://www.test/minha-conta", 302);
  expect(() => upstream.headers.set("cache-control", "private")).toThrow(TypeError);
  ports.request.mockResolvedValue(upstream);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await proxyAuthenticationRequest(new Request("https://www.test/api/auth/get-session"));
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://www.test/minha-conta");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(log).not.toHaveBeenCalled();
});
