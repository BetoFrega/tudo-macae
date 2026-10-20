import type * as entry from "../claims";
export async function run(module: typeof entry) {
  let claims: Record<string, unknown> = { editor: true };
  const roles = module.createRoleAdministration({
    readClaims: async () => claims,
    writeClaims: async (_uid, next) => {
      claims = next;
    },
    revokeSessions: async () => {},
  });
  await roles.update("user", { admin: true });
  await roles.update("user", { admin: false });
  await roles.updateFor({ uid: "admin", isAdmin: true }, "user", {
    editor: true,
  });
}
