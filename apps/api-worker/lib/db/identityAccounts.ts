import z from "zod";
export type IdentityRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  disabled: number;
  claims: string;
  createdAt: number | string;
  lastSignIn: number | null;
};
export function identityAccount(row: IdentityRow) {
  return {
    uid: row.id,
    displayName: row.name || undefined,
    email: row.email,
    emailVerified: !!row.emailVerified,
    disabled: !!row.disabled,
    claims: z.record(z.string(), z.unknown()).parse(JSON.parse(row.claims)),
    createdAt:
      typeof row.createdAt === "number"
        ? row.createdAt
        : Date.parse(row.createdAt),
    lastSignIn: row.lastSignIn ?? undefined,
  };
}
export async function readIdentityAccount(database: D1Database, uid: string) {
  const row = await database
    .prepare(
      "SELECT id,name,email,emailVerified,disabled,claims,createdAt,lastSignIn FROM user WHERE id=?",
    )
    .bind(uid)
    .first<IdentityRow>();
  if (!row) return null;
  return identityAccount(row);
}
