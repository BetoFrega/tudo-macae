import { expect, test, vi } from "vitest";
import {
  createAccountAccess,
  type AccountAccessDependencies,
} from "../accountAccess";

test("registration retains the UID and session when initial verification fails", async () => {
  const access = createAccountAccess({
    signUp: async () => ({
      status: "created",
      sessionCredential: "token",
      verificationCredential: "refresh",
    }),
    issueSession: async () => ({ success: true, uid: "original-uid" }),
    sendVerification: async () => {
      throw new Error("Provider unavailable");
    },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  });
  expect(
    await access.register({
      email: "ana@example.com",
      password: "Password123!",
    }),
  ).toEqual({
    success: true,
    uid: "original-uid",
    verificationError:
      "Sua conta foi criada, mas não foi possível enviar a verificação. Abra Verificar e-mail para tentar novamente.",
  });
});

function dependencies(): AccountAccessDependencies {
  return {
    signUp: vi.fn(async () => ({
      status: "created" as const,
      sessionCredential: "token",
      verificationCredential: "refresh",
    })),
    issueSession: vi.fn(async () => ({ success: true, uid: "original-uid" })),
    sendVerification: vi.fn(async () => ({ status: "verified" as const })),
    requestPasswordReset: vi.fn(async () => true),
    resetPassword: vi.fn(async () => ({
      success: true,
      email: "ana@example.com",
    })),
  };
}

test("registration rejects invalid credentials before invoking the provider", async () => {
  const adapters = dependencies();
  const access = createAccountAccess(adapters);
  expect(
    await access.register({ email: "ana@example.com", password: "short" }),
  ).toEqual({
    success: false,
    error: "A senha deve ter pelo menos 6 caracteres.",
  });
  expect(adapters.signUp).not.toHaveBeenCalled();
});

test.each([
  ["EMAIL_EXISTS", "Este e-mail já está em uso."],
  [
    "WEAK_PASSWORD : too short",
    "A senha é muito fraca. Use pelo menos 6 caracteres.",
  ],
  ["OTHER_FAILURE", "Erro ao criar conta."],
])(
  "registration preserves the refusal message for %s",
  async (reason, error) => {
    const adapters = dependencies();
    adapters.signUp = async () => ({ status: "refused", reason });
    expect(
      await createAccountAccess(adapters).register({
        email: "ana@example.com",
        password: "Password123!",
      }),
    ).toEqual({ success: false, error });
    expect(adapters.issueSession).not.toHaveBeenCalled();
  },
);

test("a failed verification send preserves the successfully issued session", async () => {
  const adapters = dependencies();
  adapters.sendVerification = async () => ({
    status: "error",
    error: "Não foi possível enviar.",
  });
  expect(
    await createAccountAccess(adapters).register({
      email: "ana@example.com",
      password: "Password123!",
    }),
  ).toEqual({
    success: true,
    uid: "original-uid",
    verificationError: "Não foi possível enviar.",
  });
});

test("password recovery preserves validation, provider errors and the recovered address", async () => {
  const adapters = dependencies();
  const access = createAccountAccess(adapters);
  expect(
    await access.requestPasswordResetEmail({ email: "invalid" }),
  ).toMatchObject({ success: false });
  expect(adapters.requestPasswordReset).not.toHaveBeenCalled();
  expect(await access.resetPassword("code", "short")).toEqual({
    success: false,
    error: "A senha deve ter pelo menos 6 caracteres.",
  });
  expect(adapters.resetPassword).not.toHaveBeenCalled();
  expect(
    await access.requestPasswordResetEmail({ email: "ana@example.com" }),
  ).toEqual({ success: true });
  expect(await access.resetPassword("code", "Password123!")).toEqual({
    success: true,
    email: "ana@example.com",
  });
  adapters.requestPasswordReset = async () => false;
  adapters.resetPassword = async () => ({
    success: false,
    error: "INVALID_OOB_CODE",
  });
  expect(
    await access.requestPasswordResetEmail({ email: "ana@example.com" }),
  ).toEqual({
    success: false,
    error: "Ocorreu um erro ao enviar o email de redefinição de senha.",
  });
  expect(await access.resetPassword("code", "Password123!")).toEqual({
    success: false,
    error: "INVALID_OOB_CODE",
  });
});

test("registration and recovery explain the wait without issuing a session or resending", async () => {
  const adapters = dependencies();
  adapters.signUp = async () => ({ status: "refused", retryAfter: 10 });
  adapters.requestPasswordReset = async () => ({ retryAfter: 60 });
  const access = createAccountAccess(adapters);
  expect(await access.register({ email: "ana@example.com", password: "abc123" })).toEqual({ success: false, error: "Muitas tentativas. Aguarde 10 segundos e tente novamente." });
  expect(adapters.issueSession).not.toHaveBeenCalled();
  expect(await access.requestPasswordResetEmail({ email: "ana@example.com" })).toEqual({ success: false, error: "Muitas tentativas. Aguarde 60 segundos e tente novamente." });
});

test("registration and recovery forward the challenge token and explain a refused challenge", async () => {
  const adapters = dependencies();
  adapters.signUp = vi.fn(async () => ({ status: "refused" as const, reason: "HUMAN_CHALLENGE_FAILED" }));
  adapters.requestPasswordReset = vi.fn(async () => "challenged" as const);
  const access = createAccountAccess(adapters);
  const refused = { success: false, error: "Confirme que você não é um robô e tente novamente." };
  expect(await access.register({ email: "ana@example.com", password: "abc123", challengeToken: "signup" })).toEqual(refused);
  expect(adapters.signUp).toHaveBeenCalledWith({ email: "ana@example.com", password: "abc123", challengeToken: "signup" });
  expect(adapters.issueSession).not.toHaveBeenCalled();
  expect(await access.requestPasswordResetEmail({ email: "ana@example.com", challengeToken: "reset" })).toEqual(refused);
  expect(adapters.requestPasswordReset).toHaveBeenCalledWith("ana@example.com", "reset");
});
