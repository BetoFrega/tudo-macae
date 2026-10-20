import type { RecoveryProof } from "@tudomacae/authentication/account-recovery";
export async function recoveryTokenHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    byte => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function issuePasswordRecovery(
  database: D1Database,
  token: string,
  uid: string,
  recipient: string,
  now: number,
) {
  const result = await database
    .prepare(
      "INSERT INTO password_recovery (tokenHash,userId,recipient,expiresAt) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM verification WHERE identifier=? AND value=? AND expiresAt>?)",
    )
    .bind(await recoveryTokenHash(token), uid, recipient, now + 3600_000, `reset-password:${token}`, uid, now)
    .run();
  if (result.meta.changes !== 1) throw new Error("Recovery proof superseded");
}
export async function readPasswordRecovery(
  database: D1Database,
  token: string,
): Promise<RecoveryProof | null> {
  const row = await database
    .prepare(
      "SELECT user.id AS uid,user.email,user.disabled,user.migrated,password_recovery.recipient,password_recovery.expiresAt FROM user JOIN password_recovery ON password_recovery.userId=user.id WHERE password_recovery.tokenHash=?",
    )
    .bind(await recoveryTokenHash(token))
    .first<{
    uid: string;
    email: string;
    disabled: number;
    migrated: number;
    recipient: string;
    expiresAt: number;
  }>();
  return row
    ? { ...row, disabled: !!row.disabled, migrated: !!row.migrated }
    : null;
}
export async function completePasswordRecovery(
  database: D1Database,
  proof: RecoveryProof & { token: string; confirmRecipient: boolean },
  passwordHash: string,
  now: number,
) {
  const tokenHash = await recoveryTokenHash(proof.token);
  const condition = `SELECT user.id FROM user JOIN password_recovery ON password_recovery.userId=user.id WHERE password_recovery.tokenHash=? AND password_recovery.expiresAt>? AND password_recovery.recipient=user.email AND user.disabled=0`;
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) SELECT ?,id,'credential',id,?,?,? FROM user WHERE id IN (${condition}) ON CONFLICT(userId,providerId) DO UPDATE SET password=excluded.password,updatedAt=excluded.updatedAt`,
      )
      .bind(crypto.randomUUID(), passwordHash, now, now, tokenHash, now),
    database
      .prepare(
        `UPDATE user SET emailVerified=CASE WHEN ?=1 THEN 1 ELSE emailVerified END,updatedAt=? WHERE id IN (${condition})`,
      )
      .bind(Number(proof.confirmRecipient), now, tokenHash, now),
    database
      .prepare(`DELETE FROM session WHERE userId IN (${condition})`)
      .bind(tokenHash, now),
    database
      .prepare(
        `DELETE FROM verification WHERE identifier LIKE 'reset-password:%' AND value IN (${condition})`,
      )
      .bind(tokenHash, now),
    database
      .prepare(
        `DELETE FROM password_recovery WHERE userId IN (${condition})`,
      )
      .bind(tokenHash, now),
  ]);
  return results[0].meta.changes === 1;
}
