import { expect, test } from "vitest";
import { createRoleAdministration } from "../claims";

test("granting and revoking roles preserves other claims and revokes sessions on removal", async () => {
  let claims: Record<string, unknown> = { editor: true, legacy: "kept" };
  const revoked: string[] = [];
  const roles = createRoleAdministration({
    readClaims: async () => claims,
    writeClaims: async (_uid, value) => { claims = value; },
    revokeSessions: async (uid) => { revoked.push(uid); },
  });
  await roles.update("account-uid", { admin: true });
  expect(claims).toEqual({ admin: true, editor: true, legacy: "kept" });
  expect(revoked).toEqual([]);
  await roles.update("account-uid", { editor: false });
  expect(claims).toEqual({ admin: true, legacy: "kept" });
  expect(revoked).toEqual(["account-uid"]);
});
