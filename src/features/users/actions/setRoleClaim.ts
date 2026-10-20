"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  roleChangeError,
  type ProductRoleClaimName,
} from "@tudomacae/authentication/claims";
import { updateCustomClaims } from "@/integrations/authentication/claims";

export async function setRoleClaim(
  targetUid: string,
  role: ProductRoleClaimName,
  granted: boolean,
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();

  const error = roleChangeError(currentUser, targetUid, { [role]: granted });
  if (error) return { success: false, error };

  try {
    await updateCustomClaims(targetUid, { [role]: granted });
    revalidatePath("/admin/usuarios");
    return { success: true };
  }
  catch {
    console.error(
      JSON.stringify({
        event: "authentication.roles.failed",
        service: process.env.K_SERVICE ?? "next",
        environment: process.env.NODE_ENV,
        release: process.env.K_REVISION ?? "unknown",
        outcome: "failed",
      }),
    );
    return { success: false, error: "Erro ao atualizar o papel do usuário" };
  }
}
