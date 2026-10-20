/**
 * Every claim the platform grants. Unknown existing claims survive the merge;
 * the patch vocabulary is closed so typos cannot silently create unused grants.
 */
export type ProductRoleClaimName = "admin" | "editor";

export type ClaimName = ProductRoleClaimName;

/** Which claims to grant (`true`) or revoke (`false`). */
export type ClaimPatch = Partial<Record<ClaimName, boolean>>;

/**
 * The persisted claim bag stays open so product role changes preserve attributes
 * owned by other capabilities.
 */
export type CustomClaims = Record<string, unknown>;

/**
 * Applies `patch` on top of `current`, leaving every unmentioned claim alone.
 *
 * Unknown keys are carried over untouched rather than dropped — this runs
 * against whatever the user's token already holds, not against a shape this
 * module controls.
 */
export function mergeClaims(
  current: CustomClaims | undefined,
  patch: ClaimPatch,
): CustomClaims {
  const merged: CustomClaims = { ...current };

  for (const [name, granted] of Object.entries(patch)) {
    if (granted) merged[name] = true;
    else delete merged[name];
  }

  return merged;
}

export type RoleChangeActor = { uid: string; isAdmin: boolean };
export function roleChangeError(
  actor: RoleChangeActor | null,
  uid: string,
  patch: ClaimPatch,
) {
  if (!actor?.isAdmin) return "Não autorizado";
  if (actor.uid === uid && patch.admin === false)
    return "Você não pode remover seu próprio status de admin";
  return undefined;
}
export type RoleAdministrationDependencies
  = | {
    updateClaims(
      uid: string,
      apply: (claims: CustomClaims | undefined) => CustomClaims,
      revoke: boolean,
    ): Promise<void>;
  }
  | {
    updateClaims?: undefined;
    readClaims(uid: string): Promise<CustomClaims | undefined>;
    writeClaims(uid: string, claims: CustomClaims): Promise<void>;
    revokeSessions(uid: string): Promise<void>;
  };
export function createRoleAdministration(
  dependencies: RoleAdministrationDependencies,
) {
  async function update(uid: string, patch: ClaimPatch) {
    if (dependencies.updateClaims)
      return dependencies.updateClaims(
        uid,
        current => mergeClaims(current, patch),
        Object.values(patch).includes(false),
      );
    const current = await dependencies.readClaims(uid);
    await dependencies.writeClaims(uid, mergeClaims(current, patch));
    if (Object.values(patch).includes(false))
      await dependencies.revokeSessions(uid);
  }
  return {
    update,
    async updateFor(actor: RoleChangeActor, uid: string, patch: ClaimPatch) {
      const error = roleChangeError(actor, uid, patch);
      if (error) throw new Error(error);
      await update(uid, patch);
    },
  };
}
