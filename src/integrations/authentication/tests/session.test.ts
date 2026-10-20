import { afterEach, expect, test, vi } from "vitest";
import { resolveSession } from "../session";
const ports = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@tudomacae/authentication-client/server", () => ({ configuredAuthenticationClient: () => ({ session: ports.session }) }));
afterEach(() => {
  vi.clearAllMocks();
});

test("an unavailable API fails the read and anonymous reads need no remote session", async () => {
  ports.session.mockRejectedValue(new Error("API unavailable"));
  expect(await resolveSession()).toEqual({ status: "missing" });
  expect(ports.session).not.toHaveBeenCalled();
  await expect(resolveSession("current-provider-cookie")).rejects.toThrow("API unavailable");
});
