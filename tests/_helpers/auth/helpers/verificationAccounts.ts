import { workerFixture } from "./workerFixture";
import { playwrightTarget } from "../../../../bin/playwrightTarget";

const disposableEmails = new Set<string>();
export function registerDisposableEmail(email: string) {
  disposableEmails.add(email);
}
async function account(email: string) {
  if (!disposableEmails.has(email))
    throw new Error("Conta não pertence a esta execução de teste.");
  const user = await workerFixture<{
    uid: string;
    email: string;
    emailVerified: boolean;
  } | null>("/find", { email });
  if (!user) throw new Error("Fixture account missing");
  return user;
}
export async function confirmDisposableEmail(email: string) {
  await account(email);
  await workerFixture("/verify", { email, emailVerified: true });
}
export async function readDisposablePasswordResetLink(email: string) {
  await account(email);
  return readWorkerLink(email, "resetPassword");
}
type VerificationLinkOptions = {
  publication?: string;
  newEmail?: string;
};
export async function readDisposableVerificationLink(
  email: string,
  options: VerificationLinkOptions = {},
) {
  const { publication, newEmail } = options;
  await account(email);
  if (newEmail) registerDisposableEmail(newEmail);
  return readWorkerLink(email, "verifyEmail", newEmail, {
    ...(publication ? { publication } : {}),
  });
}

async function readWorkerLink(
  email: string,
  mode: string,
  newEmail?: string,
  continuation?: { publication?: string },
) {
  const mail = await workerFixture<{ text: string } | null>("/mail", {
    email,
    mode,
    newEmail,
  });
  const link = mail?.text.split("\n").find(line => line.startsWith("http"));
  if (!link)
    throw new Error("Application did not emit the authentication message");
  const target = new URL(link);
  const origin = new URL(playwrightTarget().origin);
  target.protocol = origin.protocol;
  target.host = origin.host;
  if (continuation?.publication) {
    const next = new URL("/minha-conta/verificar-email", origin);
    next.searchParams.set("publication", continuation.publication);
    target.searchParams.set("continueUrl", next.href);
  }
  return target.href;
}
