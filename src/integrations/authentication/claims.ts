import type { ClaimPatch } from "@tudomacae/authentication/claims";
import { workerProcedure } from "./authority";

export async function updateCustomClaims(uid: string, patch: ClaimPatch) {
  await workerProcedure("updateRoles", { uid, patch }, true);
}
