"use server";

import { AdvertiserProfileAccessError } from "@tudomacae/advertiser-identity/profiles";

import { assertEmailAllowsPublication } from "@tudomacae/ads/publicationEligibility";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adListingTags } from "@tudomacae/ads";
import { verifyAdvertiserProfileOwnershipUseCase } from "@/packages/classifieds-api";
import { createAdUseCase } from "../../../integrations/ads/use-cases/createAdUseCase";
import { getUserAdvertiserProfilesUseCase } from "@/packages/classifieds-api";

type CreateAdResult
  = | { success: true; adId: string; slug: string }
    | { success: false; error: string };

type CreateAdFields = { categoryId: string; subcategoryId: string; title: string; text: string };

function readRequiredFields(formData: FormData): CreateAdFields | null {
  const categoryId = formData.get("categoryId") as string;
  const subcategoryId = formData.get("subcategoryId") as string;
  const title = formData.get("title") as string;
  const text = formData.get("text") as string;
  if (!categoryId || !subcategoryId || !title || !text) return null;
  return { categoryId, subcategoryId, title, text };
}

async function resolveAdvertiserProfileId(userId: string, requestedId: string | null): Promise<{ id: string } | { error: string }> {
  if (!requestedId) {
    const profiles = await getUserAdvertiserProfilesUseCase(userId);
    const fallbackId = profiles[0]?.id;
    if (!fallbackId) return { error: "Não foi possível encontrar um perfil de anunciante para publicar o anúncio." };
    return { id: fallbackId };
  }
  const profileBelongsToUser = await verifyAdvertiserProfileOwnershipUseCase({ id: requestedId, userId }).catch((error: unknown) => {
    if (error instanceof AdvertiserProfileAccessError) return null;
    throw error;
  });
  if (!profileBelongsToUser) return { error: "Você não tem permissão para publicar neste perfil de anunciante." };
  return { id: requestedId };
}

function invalidateAdListings(advertiserProfileId: string, fields: CreateAdFields) {
  revalidatePath("/");
  updateTag(`ads-by-profile-${advertiserProfileId}`);
  for (const tag of adListingTags({ categoryId: fields.categoryId, subcategoryId: fields.subcategoryId })) {
    updateTag(tag);
  }
}

export async function createAd(formData: FormData): Promise<CreateAdResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "Entre na sua conta para publicar um anúncio.",
      };
    }

    if (!user.emailVerified) return { success: false, error: "Confirme seu e-mail antes de publicar o anúncio." };
    assertEmailAllowsPublication(user.emailVerified, undefined, "active");
    const fields = readRequiredFields(formData);
    if (!fields) {
      return {
        success: false,
        error: "Preencha os campos obrigatórios do anúncio.",
      };
    }

    const profile = await resolveAdvertiserProfileId(user.uid, formData.get("advertiserProfileId") as string | null);
    if ("error" in profile) return { success: false, error: profile.error };

    const publicationId = formData.get("publicationId");
    const result = await createAdUseCase({
      ...fields,
      advertiserProfileId: profile.id,
      userId: user.uid,
      ...(typeof publicationId === "string" ? { id: publicationId } : {}),
    });

    invalidateAdListings(profile.id, fields);

    return { success: true, adId: result.id, slug: result.slug };
  }
  catch (error) {
    console.error("Error creating ad:", error);
    return { success: false, error: "Não foi possível criar o anúncio." };
  }
}
