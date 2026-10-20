"use server";

import { revalidatePath, updateTag } from "next/cache";
import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { deleteAdvertiserIdentityUseCase, previewAdvertiserIdentityDeletionUseCase } from "@/packages/classifieds-api";
import { deleteAdvertiserIdentitySchema } from "@tudomacae/advertiser-identity/identityDeletion";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";

async function administrator() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();
  return user;
}

export async function previewAdminAdvertiserIdentityDeletion(id: string) {
  const user = await administrator();
  return previewAdvertiserIdentityDeletionUseCase({ id, actorId: user.uid, channel: "administration" });
}

export async function adminDeleteAdvertiserIdentity(input: unknown) {
  const user = await administrator();
  const value = deleteAdvertiserIdentitySchema.parse(input);
  const correlationId = crypto.randomUUID();
  let result;
  try {
    result = await deleteAdvertiserIdentityUseCase({ ...value, actorId: user.uid, channel: "administration", correlationId });
  }
  catch (error) {
    if (error instanceof AdvertiserProfileAdministrationError) return { success: false as const, error: error.message };
    console.error(JSON.stringify({ event: "advertiser_identity_deletion", service: process.env.K_SERVICE ?? "next", environment: process.env.NODE_ENV, release: process.env.K_REVISION ?? "unknown", outcome: "failed", cause: "unexpected", correlationId }));
    return { success: false as const, error: "Não foi possível excluir o perfil. Tente novamente." };
  }
  invalidateActivityAreaAdvertisers(result.effects.previousActivityAreas);
  for (const tag of result.cacheTags) updateTag(tag);
  revalidatePath("/admin/perfis");
  revalidatePath("/minha-conta/perfis");
  revalidatePath("/minha-conta/anuncios");
  return { success: true as const };
}
