"use server";

import { revalidatePath, updateTag } from "next/cache";
import { notFound, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adListingTags } from "@tudomacae/ads";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { deleteAdUseCase } from "../../../integrations/ads/use-cases/deleteAdUseCase";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";

export async function deleteAd(adId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }

  try {
    // Verify ownership (will throw if not authorized)
    const ad = await verifyAdOwnershipUseCase({
      id: adId,
      userId: user.uid,
      isAdmin: user.isAdmin,
    });

    await deleteAdUseCase({ id: adId });

    revalidatePath("/");
    revalidatePath("/minha-conta/anuncios");
    updateTag("ads");
    revalidatePath(`/anuncio/${adId}`);
    if (ad.advertiserProfileId)
      updateTag(`ads-by-profile-${ad.advertiserProfileId}`);

    updateTag(`ad-${adId}`);
    for (const tag of adListingTags(ad)) {
      updateTag(tag);
    }

    return { success: true as const };
  }
  catch (error) {
    if (error instanceof Error && error.message === "Ad not found") {
      return notFound();
    }
    console.error(JSON.stringify({
      event: "ad-delete",
      ...publicImageRuntimeContext(),
      outcome: "failed",
      cause: "unexpected",
      correlationId: crypto.randomUUID(),
    }));
    throw new Error("Failed to delete ad");
  }
}
