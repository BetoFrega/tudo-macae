import type {
  EmailVerificationDependencies,
  VerificationAttempt,
} from "@tudomacae/authentication/email-verification";
import { recoveryTokenHash } from "./passwordRecovery";
export function verificationAttempts(
  database: D1Database,
): EmailVerificationDependencies["attempts"] {
  async function read(uid: string): Promise<VerificationAttempt> {
    const row = await database
      .prepare(
        "SELECT nextSendAt,error,pendingEmail FROM verification_attempt WHERE userId=?",
      )
      .bind(uid)
      .first<{
      nextSendAt: number;
      error: string | null;
      pendingEmail: string | null;
    }>();
    return {
      nextSendAt: row?.nextSendAt ?? 0,
      ...(row?.error ? { error: row.error } : {}),
      ...(row?.pendingEmail ? { pendingEmail: row.pendingEmail } : {}),
    };
  }
  return {
    read,
    async reserve(uid, decide) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = await read(uid);
        const decision = decide(current.nextSendAt);
        if (!decision.allowed) return decision;
        const result = await database
          .prepare(
            `INSERT INTO verification_attempt (userId,nextSendAt) VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET nextSendAt=excluded.nextSendAt,error=NULL,pendingEmail=NULL WHERE verification_attempt.nextSendAt=?`,
          )
          .bind(uid, decision.nextSendAt, current.nextSendAt)
          .run();
        if (result.meta.changes === 1) return decision;
      }
      return { allowed: false, nextSendAt: (await read(uid)).nextSendAt };
    },
    async finish(uid, nextSendAt, result) {
      await database
        .prepare(
          "UPDATE verification_attempt SET error=?,pendingEmail=? WHERE userId=? AND nextSendAt=?",
        )
        .bind(
          result.error ?? null,
          result.pendingEmail ?? null,
          uid,
          nextSendAt,
        )
        .run();
    },
  };
}
export async function issueEmailConfirmation(
  database: D1Database,
  uid: string,
  previousEmail: string,
  recipient: string,
  now: number,
  attemptRevision: number,
) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await recoveryTokenHash(token);
  const current = "SELECT 1 FROM verification_attempt WHERE userId=? AND nextSendAt=?";
  const results = await database.batch([
    database.prepare(`DELETE FROM email_confirmation WHERE userId=? AND EXISTS (${current})`).bind(uid, uid, attemptRevision),
    database
      .prepare(
        `INSERT INTO email_confirmation (tokenHash,userId,previousEmail,recipient,expiresAt,attemptRevision) SELECT ?,?,?,?,?,? WHERE EXISTS (${current})`,
      )
      .bind(tokenHash, uid, previousEmail, recipient, now + 3600_000, attemptRevision, uid, attemptRevision),
  ]);
  if (results[1].meta.changes !== 1) throw new Error("Verification reservation superseded");
  return token;
}
export async function confirmEmailRecipient(
  database: D1Database,
  token: string,
  now: number,
) {
  const tokenHash = await recoveryTokenHash(token);
  const proof = await database
    .prepare("SELECT recipient FROM email_confirmation WHERE tokenHash=?")
    .bind(tokenHash)
    .first<{ recipient: string }>();
  if (!proof) throw new Error("Invalid confirmation");
  const valid = `SELECT user.id FROM user JOIN email_confirmation ON email_confirmation.userId=user.id WHERE tokenHash=? AND expiresAt>? AND previousEmail=user.email AND user.disabled=0 AND user.emailVerified=0 AND email_confirmation.attemptRevision=(SELECT nextSendAt FROM verification_attempt WHERE userId=user.id)`;
  const results = await database.batch([
    database
      .prepare(
        `UPDATE user SET email=?,emailVerified=1,updatedAt=? WHERE id IN (${valid})`,
      )
      .bind(proof.recipient, now, tokenHash, now),
    database
      .prepare("DELETE FROM email_confirmation WHERE tokenHash=?")
      .bind(tokenHash),
  ]);
  if (results[0].meta.changes !== 1) throw new Error("Invalid confirmation");
  return { email: proof.recipient };
}
