import z from "zod";
import type { EmailVerificationDependencies, VerificationResult } from "../emailVerification";

const correctionInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(4096) });
export function buildEmailVerification({ provider, attempts, now }: EmailVerificationDependencies) {
  async function deliver(uid: string, effect: (attemptRevision: number) => Promise<void>, pendingEmail?: string): Promise<VerificationResult> {
    const reservation = await attempts.reserve(uid, (nextSendAt) => {
      const currentTime = now();
      return nextSendAt > currentTime
        ? { allowed: false, nextSendAt }
        : { allowed: true, nextSendAt: currentTime + 60000 };
    });
    if (!reservation.allowed) return { status: "error", error: "Aguarde um minuto antes de solicitar outro e-mail.", nextSendAt: reservation.nextSendAt };
    try {
      await effect(reservation.nextSendAt);
    }
    catch {
      const error = pendingEmail
        ? "Não foi possível corrigir o e-mail. Confira a senha e o novo endereço e tente novamente em um minuto."
        : "Não foi possível enviar o e-mail. Tente novamente em um minuto.";
      await attempts.finish(uid, reservation.nextSendAt, { error });
      return { status: "error", error, nextSendAt: reservation.nextSendAt };
    }
    const destination = pendingEmail ? { pendingEmail } : {};
    await attempts.finish(uid, reservation.nextSendAt, destination);
    return { status: "sent", nextSendAt: reservation.nextSendAt, ...destination };
  }
  return {
    async read(uid: string) {
      const account = await provider.readAccount(uid);
      return { ...account, ...await attempts.read(uid) };
    },
    async send(uid: string, continueUrl?: string, idToken?: string): Promise<VerificationResult> {
      if ((await provider.readAccount(uid)).emailVerified) return { status: "verified" };
      return deliver(uid, revision => provider.send(uid, continueUrl, idToken, revision));
    },
    async correct(uid: string, input: { email: string; password: string }, continueUrl?: string): Promise<VerificationResult> {
      const parsed = correctionInput.safeParse(input);
      if (!parsed.success) return { status: "error", error: "Informe um e-mail válido e a senha atual." };
      const account = await provider.readAccount(uid);
      if (account.emailVerified) return { status: "error", error: "Este e-mail já foi confirmado. A correção só está disponível antes da confirmação." };
      if (account.email.toLowerCase() === parsed.data.email.toLowerCase()) return { status: "error", error: "Informe o endereço corrigido, diferente do atual." };
      return deliver(uid, revision => provider.correct(uid, parsed.data.email, parsed.data.password, continueUrl, revision), parsed.data.email);
    },
    async confirm(code: string): Promise<{ status: "confirmed"; email: string } | { status: "error"; error: string }> {
      try {
        if (!code || code.length > 4096) throw new Error("Invalid code");
        const result = await provider.confirm(code);
        return { status: "confirmed", email: result.email };
      }
      catch {
        return { status: "error", error: "Este link é inválido, venceu ou já foi utilizado. Volte à verificação para consultar seu e-mail ou solicitar outro link." };
      }
    },
  };
}
