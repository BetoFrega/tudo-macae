import z from "zod";
import { authenticationRetryMessage, humanChallengeMessage } from "./passwordLogin";
import type { VerificationResult } from "./emailVerification";

const registration = z.object({
  email: z.email(),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
  challengeToken: z.string().max(2048).optional(),
});
export type AccountCredentials = z.infer<typeof registration>;
export type AccountAccessResult = {
  success: boolean;
  error?: string;
  uid?: string;
  verificationError?: string;
};
export interface AccountAccessDependencies {
  signUp(
    input: AccountCredentials,
  ): Promise<
    | {
      status: "created";
      sessionCredential: string;
      verificationCredential: string;
      verification?: VerificationResult;
    }
    | { status: "refused"; reason?: string | undefined; retryAfter?: number }
  >;
  issueSession(
    sessionCredential: string,
    verificationCredential: string,
  ): Promise<AccountAccessResult>;
  sendVerification(
    uid: string,
    sessionCredential: string,
  ): Promise<VerificationResult>;
  requestPasswordReset(email: string, challengeToken?: string): Promise<boolean | "challenged" | { retryAfter: number }>;
  resetPassword(
    code: string,
    password: string,
  ): Promise<{
    success: boolean;
    email?: string | undefined;
    error?: string | undefined;
    retryAfter?: number;
  }>;
}
type SignUpOutcome = Awaited<ReturnType<AccountAccessDependencies["signUp"]>>;

function refusalError(account: Extract<SignUpOutcome, { status: "refused" }>) {
  if (account.retryAfter !== undefined) return authenticationRetryMessage(account.retryAfter);
  if (account.reason === "HUMAN_CHALLENGE_FAILED") return humanChallengeMessage;
  if (account.reason === "EMAIL_EXISTS") return "Este e-mail já está em uso.";
  if (account.reason?.includes("WEAK_PASSWORD")) return "A senha é muito fraca. Use pelo menos 6 caracteres.";
  return "Erro ao criar conta.";
}

export function createAccountAccess(dependencies: AccountAccessDependencies) {
  async function withVerification(
    account: Extract<SignUpOutcome, { status: "created" }>,
    uid: string,
    session: AccountAccessResult,
  ): Promise<AccountAccessResult> {
    try {
      const verification
        = account.verification
          ?? (await dependencies.sendVerification(
            uid,
            account.sessionCredential,
          ));
      if (verification.status === "error")
        return { ...session, verificationError: verification.error };
    }
    catch {
      return {
        ...session,
        verificationError:
          "Sua conta foi criada, mas não foi possível enviar a verificação. Abra Verificar e-mail para tentar novamente.",
      };
    }
    return session;
  }
  return {
    async register(input: unknown): Promise<AccountAccessResult> {
      const validation = registration.safeParse(input);
      if (!validation.success)
        return {
          success: false,
          error: validation.error.issues.map(i => i.message).join(", "),
        };
      const account = await dependencies.signUp(validation.data);
      if (account.status === "refused") return { success: false, error: refusalError(account) };
      const session = await dependencies.issueSession(
        account.sessionCredential,
        account.verificationCredential,
      );
      if (!session.success || !session.uid) return session;
      return withVerification(account, session.uid, session);
    },
    async requestPasswordResetEmail(input: unknown) {
      const validation = z.object({ email: z.email(), challengeToken: z.string().max(2048).optional() }).safeParse(input);
      if (!validation.success)
        return {
          success: false,
          error: validation.error.issues.map(i => i.message).join(", "),
        };
      const result = await dependencies.requestPasswordReset(validation.data.email, validation.data.challengeToken);
      if (result === "challenged") return { success: false, error: humanChallengeMessage };
      if (typeof result === "object")
        return { success: false, error: authenticationRetryMessage(result.retryAfter) };
      return result
        ? { success: true }
        : {
            success: false,
            error: "Ocorreu um erro ao enviar o email de redefinição de senha.",
          };
    },
    async resetPassword(code: string, password: string) {
      const validation = z
        .string()
        .min(6, "A senha deve ter pelo menos 6 caracteres.")
        .safeParse(password);
      if (!validation.success)
        return {
          success: false,
          error: validation.error.issues.map(i => i.message).join(", "),
        };
      return dependencies.resetPassword(code, validation.data);
    },
  };
}
