import { expect, test, vi } from "vitest";
import { createPasswordLogin } from "../passwordLogin";

test("validates credentials, issues a session, and returns only the user identifier", async () => {
  const authenticate = vi.fn(async () => ({
    status: "authenticated" as const,
    sessionCredential: "provider-token",
    verificationCredential: "refresh-token",
  }));
  const createSession = vi.fn(async () => ({
    success: true as const,
    uid: "ana",
  }));
  const login = createPasswordLogin({ authenticate, createSession });

  expect(
    await login.login({ email: "ana@example.com", password: "secret" }),
  ).toEqual({ success: true, uid: "ana" });
  expect(authenticate).toHaveBeenCalledWith({
    email: "ana@example.com",
    password: "secret",
  });
  expect(createSession).toHaveBeenCalledWith("provider-token", "refresh-token");
});

test("refuses invalid input without calling infrastructure", async () => {
  const authenticate = vi.fn();
  const createSession = vi.fn();
  const login = createPasswordLogin({ authenticate, createSession });

  expect(
    await login.login({ email: "not-an-email", password: "secret" }),
  ).toMatchObject({ success: false });
  expect(authenticate).not.toHaveBeenCalled();
  expect(createSession).not.toHaveBeenCalled();
});

test("returns a generic refusal for expected invalid credentials", async () => {
  const login = createPasswordLogin({
    async authenticate() {
      return { status: "refused" as const };
    },
    async createSession() {
      return { success: false };
    },
  });
  expect(
    await login.login({ email: "ana@example.com", password: "secret" }),
  ).toEqual({
    success: false,
    error: "Erro ao entrar. Verifique seu email e senha.",
  });
});

test("propagates unexpected adapter failures to the HTTP boundary", async () => {
  const login = createPasswordLogin({
    async authenticate() {
      throw new Error("private provider detail");
    },
    async createSession() {
      return { success: true as const, uid: "ana" };
    },
  });
  await expect(
    login.login({ email: "ana@example.com", password: "secret" }),
  ).rejects.toThrow("private provider detail");
});

test("returns a generic recoverable result when cookie issuance refuses", async () => {
  const login = createPasswordLogin({
    async authenticate() {
      return { status: "authenticated" as const, sessionCredential: "token" };
    },
    async createSession() {
      return { success: false as const };
    },
  });
  expect(
    await login.login({ email: "ana@example.com", password: "secret" }),
  ).toEqual({
    success: false,
    error: "Não foi possível iniciar a sessão. Tente novamente.",
  });
});

test("explains the retry deadline and succeeds when the adapter admits the next attempt", async () => {
  let limited = true;
  const login = createPasswordLogin({
    async authenticate() {
      return limited ? { status: "limited", retryAfter: 7 } : { status: "authenticated", sessionCredential: "token" };
    },
    async createSession() { return { success: true, uid: "ana" }; },
  });
  expect(await login.login({ email: "ana@example.com", password: "secret" })).toEqual({ success: false, error: "Muitas tentativas. Aguarde 7 segundos e tente novamente." });
  limited = false;
  expect(await login.login({ email: "ana@example.com", password: "secret" })).toEqual({ success: true, uid: "ana" });
});

test("forwards the challenge token and explains a refused challenge without creating a session", async () => {
  const authenticate = vi.fn(async () => ({ status: "challenged" as const }));
  const createSession = vi.fn();
  const login = createPasswordLogin({ authenticate, createSession });
  expect(await login.login({ email: "ana@example.com", password: "secret", challengeToken: "token" })).toEqual({
    success: false,
    error: "Confirme que você não é um robô e tente novamente.",
  });
  expect(authenticate).toHaveBeenCalledWith({ email: "ana@example.com", password: "secret", challengeToken: "token" });
  expect(createSession).not.toHaveBeenCalled();
  expect(await login.login({ email: "ana@example.com", password: "secret", challengeToken: "x".repeat(2049) })).toMatchObject({ success: false });
  expect(authenticate).toHaveBeenCalledOnce();
});
