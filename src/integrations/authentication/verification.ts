import { workerProcedure } from "./authority";
import type { VerificationAccount, VerificationAttempt, VerificationResult } from "@tudomacae/authentication/email-verification";

export async function readEmailVerification(): Promise<VerificationAccount & VerificationAttempt> {
  return workerProcedure("readVerification", null);
}
export async function confirmEmailVerification(
  code: string,
): Promise<{ status: "confirmed"; email: string } | { status: "error"; error: string }> {
  return workerProcedure("confirmEmail", { code }, true);
}
export async function correctUnverifiedEmail(
  input: { email: string; password: string },
  continueUrl?: string,
): Promise<VerificationResult> {
  return workerProcedure("correctEmail", { ...input, continueUrl }, true);
}
export async function requestEmailVerification(continueUrl?: string): Promise<VerificationResult> {
  return workerProcedure("sendVerification", { continueUrl }, true);
}
