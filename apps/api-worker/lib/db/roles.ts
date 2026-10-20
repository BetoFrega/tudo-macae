import {
  createRoleAdministration,
  type ClaimPatch,
} from "@tudomacae/authentication/claims";
import { TRPCError } from "@trpc/server";
import z from "zod";
export async function updateIdentityRoles(
  database: D1Database,
  actor: string,
  uid: string,
  patch: ClaimPatch,
) {
  const roles = createRoleAdministration({
    async updateClaims(target, apply, revoke) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await database
          .prepare("SELECT claims FROM user WHERE id=?")
          .bind(target)
          .first<{ claims: string }>();
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const current = z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(row.claims));
        const claims = JSON.stringify(apply(current));
        const statements = [
          database
            .prepare(
              `UPDATE user SET claims=?,updatedAt=? WHERE id=? AND claims=? AND EXISTS (SELECT 1 FROM user actor WHERE actor.id=? AND actor.disabled=0 AND json_type(actor.claims,'$.admin')='true')`,
            )
            .bind(claims, Date.now(), target, row.claims, actor),
        ];
        if (revoke)
          statements.push(
            database
              .prepare("DELETE FROM session WHERE userId=? AND changes()=1")
              .bind(target),
          );
        const result = await database.batch(statements);
        if (result[0].meta.changes === 1) return;
        const administrator = await database
          .prepare(
            "SELECT id FROM user WHERE id=? AND disabled=0 AND json_type(claims,'$.admin')='true'",
          )
          .bind(actor)
          .first();
        if (!administrator) throw new TRPCError({ code: "FORBIDDEN" });
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: "Concurrent role update",
      });
    },
  });
  await roles.updateFor({ uid: actor, isAdmin: true }, uid, patch);
}
