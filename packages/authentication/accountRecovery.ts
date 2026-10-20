import z from "zod";
export type RecoveryProof = {
  uid: string;
  recipient: string;
  email: string;
  expiresAt: number;
  disabled: boolean;
  migrated: boolean;
};
export function createAccountRecovery(dependencies: {
  now(): number;
  read(token: string): Promise<RecoveryProof | null>;
  hashPassword(password: string): Promise<string>;
  complete(
    proof: RecoveryProof & { token: string; confirmRecipient: boolean },
    hash: string,
  ): Promise<boolean>;
}) {
  return {
    async reset(token: string, password: string) {
      const parsed = z
        .object({
          token: z.string().min(1).max(4096),
          password: z.string().min(6).max(4096),
        })
        .safeParse({ token, password });
      const invalid = {
        success: false as const,
        error: "Link inválido ou vencido. Solicite outro.",
      };
      if (!parsed.success) return invalid;
      const proof = await dependencies.read(parsed.data.token);
      if (
        !proof
        || proof.disabled
        || proof.expiresAt <= dependencies.now()
        || proof.recipient !== proof.email
      )
        return invalid;
      const hash = await dependencies.hashPassword(parsed.data.password);
      const completed = await dependencies.complete(
        { ...proof, token, confirmRecipient: proof.migrated },
        hash,
      );
      return completed
        ? { success: true as const, email: proof.recipient }
        : invalid;
    },
  };
}
