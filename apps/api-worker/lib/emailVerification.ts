import { createEmailVerification } from "@tudomacae/authentication/email-verification";
import { readIdentityAccount } from "./db/identityAccounts";
import {
  confirmEmailRecipient,
  issueEmailConfirmation,
  verificationAttempts,
} from "./db/emailVerification";
import type { AuthenticationMail } from "./workerDependencies";
export function workerEmailVerification(configuration: {
  database: D1Database;
  publicOrigin: string;
  headers: Headers;
  uid?: string;
  verifyPassword(password: string): Promise<unknown>;
  send(mail: Omit<AuthenticationMail, "from">): Promise<void>;
}) {
  async function readAccount(uid: string) {
    const account = await readIdentityAccount(configuration.database, uid);
    if (
      !account
      || account.disabled
      || !account.email
      || uid !== configuration.uid
    )
      throw new Error("Account unavailable");
    return { uid, email: account.email, emailVerified: account.emailVerified };
  }
  async function deliver(uid: string, recipient: string, attemptRevision: number, continueUrl?: string) {
    const account = await readAccount(uid);
    const token = await issueEmailConfirmation(
      configuration.database,
      uid,
      account.email,
      recipient,
      Date.now(),
      attemptRevision,
    );
    const url = new URL("/minha-conta/acao", configuration.publicOrigin);
    url.searchParams.set("mode", "verifyEmail");
    url.searchParams.set("token", token);
    if (continueUrl) {
      const continuation = new URL(continueUrl, configuration.publicOrigin);
      if (continuation.origin !== new URL(configuration.publicOrigin).origin)
        throw new Error("Invalid continuation");
      url.searchParams.set("continueUrl", continuation.href);
    }
    await configuration.send({
      to: recipient,
      subject: "Confirme seu e-mail no Tudo Macaé",
      text: `Confirme seu e-mail no Tudo Macaé.\n${url.href}`,
      html: `<p>Confirme seu e-mail no Tudo Macaé.</p><p><a href="${url.href.replaceAll("&", "&amp;")}">Confirmar e-mail</a></p>`,
    });
  }
  return createEmailVerification({
    now: Date.now,
    attempts: verificationAttempts(configuration.database),
    provider: {
      readAccount,
      async send(uid, continueUrl, _idToken, attemptRevision) {
        if (!attemptRevision) throw new Error("Verification reservation missing");
        const account = await readAccount(uid);
        await deliver(uid, account.email, attemptRevision, continueUrl);
      },
      async correct(uid, email, password, continueUrl, attemptRevision) {
        if (!attemptRevision) throw new Error("Verification reservation missing");
        await configuration.verifyPassword(password);
        await deliver(uid, email.toLowerCase(), attemptRevision, continueUrl);
      },
      confirm: code =>
        confirmEmailRecipient(configuration.database, code, Date.now()),
    },
  });
}
