"use server";

import { revalidateTag, updateTag } from "next/cache";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { updateSubcategoryUseCase } from "@/packages/classifieds-api";
import type { UpdateSubcategoryInput } from "@tudomacae/categories/validation";
import { invalidateActivityAreaAdvertisers } from "@/features/advertiser-profile/actions/invalidateActivityAreaAdvertisers";

export async function updateSubcategory(params: UpdateSubcategoryInput) {
  await authorizeCategoryManagement();

  try {
    await updateSubcategoryUseCase(params);
    revalidateTag("categories", "max");
    updateTag("categories");
    invalidateActivityAreaAdvertisers([params]);
    return { success: true };
  }
  catch (error) {
    console.error("Error updating subcategory:", error);
    return { success: false, error: "Failed to update subcategory" };
  }
}
