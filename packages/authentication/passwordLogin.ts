import z from "zod";

const loginInputSchema = z.object({
  email: z.email(),
  password: z.string(),
  challengeToken: z.string().max(2048).optional(),
});

export const humanChallengeMessage = "Confirme que você não é um robô e tente novamente.";

export type PasswordLoginInput = z.infer<typeof loginInputSchema>;
export type PasswordLoginResult
  = { success: true; uid: string } | { success: false; error: string };
export type PasswordLoginDependencies = {
  authenticate(
    input: PasswordLoginInput,
  ): Promise<
    | {
      status: "authenticated";
      sessionCredential: string;
      verificationCredential?: string;
    }
    | { status: "refused" }
    | { status: "challenged" }
    | { status: "limited"; retryAfter: number }
  >;
  createSession(
    sessionCredential: string,
    verificationCredential?: string,
  ): Promise<{ success: true; uid: string } | { success: false }>;
};

export function authenticationRetryMessage(retryAfter: number) {
  return `Muitas tentativas. Aguarde ${Math.max(1, Math.ceil(retryAfter))} segundos e tente novamente.`;
}

export function createPasswordLogin(dependencies: PasswordLoginDependencies) {
  return {
    async login(input: unknown): Promise<PasswordLoginResult> {
      const parsed = loginInputSchema.safeParse(input);
      if (!parsed.success)
        return {
          success: false,
          error: "Informe um e-mail válido e uma senha.",
        };

      const authentication = await dependencies.authenticate(parsed.data);
      if (authentication.status === "limited")
        return { success: false, error: authenticationRetryMessage(authentication.retryAfter) };
      if (authentication.status === "challenged")
        return { success: false, error: humanChallengeMessage };
      if (authentication.status === "refused") {
        return {
          success: false,
          error: "Erro ao entrar. Verifique seu email e senha.",
        };
      }

      const session = await dependencies.createSession(
        authentication.sessionCredential,
        authentication.verificationCredential,
      );
      return session.success
        ? session
        : {
            success: false,
            error: "Não foi possível iniciar a sessão. Tente novamente.",
          };
    },
  };
}
