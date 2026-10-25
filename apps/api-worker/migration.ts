import type { D1Database } from "@cloudflare/workers-types";
import {
  createIdentityTransfer,
  type TransferIdentity,
} from "@tudomacae/authentication/identity-transfer";
export type ImportedAuthenticationAccount = TransferIdentity;
function transfer(database: D1Database) {
  return createIdentityTransfer({
    async readAuthority() {
      const state = await database
        .prepare(
          "SELECT phase,revision FROM authentication_authority WHERE singleton=1",
        )
        .first<{ phase: string; revision: number }>();
      if (!state) throw new Error("Authentication authority unavailable");
      return state;
    },
    async readIdentities() {
      const rows = await database
        .prepare(
          "SELECT user.id,email,emailVerified,disabled,claims,name,createdAt,lastSignIn,verification_attempt.nextSendAt,verification_attempt.error,verification_attempt.pendingEmail FROM user LEFT JOIN verification_attempt ON verification_attempt.userId=user.id ORDER BY user.id",
        )
        .all<{
        id: string;
        email: string;
        emailVerified: number;
        disabled: number;
        claims: string;
        name: string;
        createdAt: number;
        lastSignIn: number | null;
        nextSendAt: number | null;
        error: string | null;
        pendingEmail: string | null;
      }>();
      return rows.results.map(row => ({
        uid: row.id,
        email: row.email,
        emailVerified: !!row.emailVerified,
        disabled: !!row.disabled,
        claims: JSON.parse(row.claims),
        createdAt: row.createdAt,
        displayName: row.name,
        ...(row.lastSignIn === null ? {} : { lastSignIn: row.lastSignIn }),
        ...(row.nextSendAt === null
          ? {}
          : {
              verificationAttempt: {
                nextSendAt: row.nextSendAt,
                ...(row.error ? { error: row.error } : {}),
                ...(row.pendingEmail ? { pendingEmail: row.pendingEmail } : {}),
              },
            }),
      }));
    },
    async importIdentities(records) {
      for (let offset = 0; offset < records.length; offset += 50) {
        const statements = identityImportPlan(
          records.slice(offset, offset + 50),
          Date.now(),
        ).map(statement =>
          database.prepare(statement.sql).bind(...statement.parameters),
        );
        const results = await database.batch(statements);
        if (results.some(result => result.meta.changes < 1))
          throw new Error(
            "Authentication authority active or import incomplete",
          );
      }
    },
    async activate(revision) {
      const result = await database
        .prepare(
          "UPDATE authentication_authority SET phase='active',activatedAt=? WHERE singleton=1 AND phase='preparing' AND revision=?",
        )
        .bind(Date.now(), revision)
        .run();
      return result.meta.changes === 1;
    },
  });
}
export function importAuthenticationAccounts(
  database: D1Database,
  accounts: ImportedAuthenticationAccount[],
) {
  return transfer(database).prepare(accounts);
}
export function activateAuthenticationAuthority(
  database: D1Database,
  accounts: ImportedAuthenticationAccount[],
) {
  return transfer(database).activate(accounts);
}

function identityImportPlan(records: TransferIdentity[], now: number) {
  return records.flatMap(account => [
    {
      sql: `INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,claims,disabled,migrated,lastSignIn) SELECT ?,?,?,?,?,?,?,?,1,? WHERE (SELECT phase FROM authentication_authority WHERE singleton=1)='preparing' ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,emailVerified=excluded.emailVerified,updatedAt=excluded.updatedAt,claims=excluded.claims,disabled=excluded.disabled,lastSignIn=excluded.lastSignIn,migrated=excluded.migrated`,
      parameters: [
        account.uid,
        account.displayName ?? "",
        account.email,
        Number(account.emailVerified),
        account.createdAt,
        now,
        JSON.stringify(account.claims),
        Number(account.disabled),
        account.lastSignIn ?? null,
      ],
    },
    {
      sql: `INSERT INTO verification_attempt (userId,nextSendAt,error,pendingEmail) SELECT ?,?,?,? WHERE (SELECT phase FROM authentication_authority WHERE singleton=1)='preparing' ON CONFLICT(userId) DO UPDATE SET nextSendAt=excluded.nextSendAt,error=excluded.error,pendingEmail=excluded.pendingEmail`,
      parameters: [
        account.uid,
        account.verificationAttempt?.nextSendAt ?? 0,
        account.verificationAttempt?.error ?? null,
        account.verificationAttempt?.pendingEmail ?? null,
      ],
    },
  ]);
}
