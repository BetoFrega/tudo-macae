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
export async function unconfirmDisposableEmail(email: string) {
  await account(email);
  await workerFixture("/verify", { email, emailVerified: false });
}
export async function readDisposablePasswordResetLink(email: string) {
  await account(email);
  return readWorkerLink(email, "resetPassword");
}
type VerificationLinkOptions = {
  publication?: string;
  newEmail?: string;
  ad?: string;
};
export async function readDisposableVerificationLink(
  email: string,
  options: VerificationLinkOptions = {},
) {
  const { publication, newEmail, ad } = options;
  await account(email);
  if (newEmail) registerDisposableEmail(newEmail);
  return readWorkerLink(email, "verifyEmail", newEmail, {
    ...(publication ? { publication } : {}),
    ...(ad ? { ad } : {}),
  });
}

async function readWorkerLink(
  email: string,
  mode: string,
  newEmail?: string,
  continuation?: { publication?: string; ad?: string },
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
  if (continuation?.publication || continuation?.ad) {
    const next = new URL("/minha-conta/verificar-email", origin);
    if (continuation.publication)
      next.searchParams.set("publication", continuation.publication);
    if (continuation.ad) next.searchParams.set("ad", continuation.ad);
    target.searchParams.set("continueUrl", next.href);
  }
  return target.href;
}
