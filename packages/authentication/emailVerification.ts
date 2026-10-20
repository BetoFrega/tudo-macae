import { buildEmailVerification } from "./lib/emailVerification";

export type VerificationAccount = { uid: string; email: string; emailVerified: boolean };
export type VerificationAttempt = { nextSendAt: number; error?: string; pendingEmail?: string };
export type VerificationResult
  = | { status: "verified" }
    | { status: "sent"; nextSendAt: number; pendingEmail?: string }
    | { status: "error"; error: string; nextSendAt?: number };
export interface EmailVerificationDependencies {
  now(): number;
  provider: {
    readAccount(uid: string): Promise<VerificationAccount>;
    send(uid: string, continueUrl?: string, idToken?: string, attemptRevision?: number): Promise<void>;
    correct(uid: string, email: string, password: string, continueUrl?: string, attemptRevision?: number): Promise<void>;
    confirm(code: string): Promise<{ email: string }>;
  };
  attempts: {
    read(uid: string): Promise<VerificationAttempt>;
    reserve(uid: string, decide: (nextSendAt: number) => { allowed: boolean; nextSendAt: number }): Promise<{ allowed: boolean; nextSendAt: number }>;
    finish(uid: string, nextSendAt: number, result: { error?: string; pendingEmail?: string }): Promise<void>;
  };
}
export function createEmailVerification(dependencies: EmailVerificationDependencies) {
  return buildEmailVerification(dependencies);
}
