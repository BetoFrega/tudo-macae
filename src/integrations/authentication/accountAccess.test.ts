import { afterEach, expect, test, vi } from "vitest";
import { accountAccess } from "./accountAccess";
const ports = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@tudomacae/authentication-client/server", () => ({ configuredAuthenticationClient: () => ({ request: ports.request }) }));
vi.mock("./authority", () => ({ installWorkerSession: vi.fn() }));
vi.mock("./verification", () => ({ requestEmailVerification: vi.fn() }));
afterEach(() => vi.clearAllMocks());
test("maps native invalid recovery proofs to the product invalid-code result", async () => {
  ports.request.mockResolvedValue(Response.json({ code: "INVALID_TOKEN", message: "Invalid token" }, { status: 400 }));
  expect(await accountAccess.resetPassword("disposable-proof", "abc123")).toEqual({ success: false, error: "INVALID_OOB_CODE" });
});

test("preserves the provider retry deadline for registration, recovery and reset", async () => {
  ports.request.mockResolvedValue(Response.json({ message: "Too many requests" }, { status: 429, headers: { "x-retry-after": "8" } }));
  const expected = { success: false, error: "Muitas tentativas. Aguarde 8 segundos e tente novamente." };
  expect(await accountAccess.register({ email: "ana@example.com", password: "abc123" })).toEqual(expected);
  expect(await accountAccess.requestPasswordResetEmail({ email: "ana@example.com" })).toEqual(expected);
  expect(await accountAccess.resetPassword("proof", "abc123")).toEqual({ ...expected, retryAfter: 8 });
});

test("forwards the Turnstile token as a header, never in the body, and maps the Worker refusal", async () => {
  ports.request.mockImplementation(async () => Response.json({ code: "HUMAN_CHALLENGE_FAILED" }, { status: 403 }));
  const expected = { success: false, error: "Confirme que você não é um robô e tente novamente." };
  expect(await accountAccess.register({ email: "ana@example.com", password: "abc123", challengeToken: "signup-token" })).toEqual(expected);
  expect(await accountAccess.requestPasswordResetEmail({ email: "ana@example.com", challengeToken: "reset-token" })).toEqual(expected);
  const [signUp, reset] = ports.request.mock.calls;
  expect(signUp[1].body).toEqual({ email: "ana@example.com", password: "abc123" });
  expect(signUp[1].headers.get("x-turnstile-token")).toBe("signup-token");
  expect(reset[1].body).toEqual({ email: "ana@example.com" });
  expect(reset[1].headers.get("x-turnstile-token")).toBe("reset-token");
});
