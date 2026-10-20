"use server";

import { revalidateTag, updateTag } from "next/cache";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { deleteSubcategoryUseCase } from "@/packages/classifieds-api";
import { invalidateActivityAreaAdvertisers } from "@/features/advertiser-profile/actions/invalidateActivityAreaAdvertisers";
import type { DeleteSubcategoryInput } from "@tudomacae/categories/validation";

export async function deleteSubcategory(params: DeleteSubcategoryInput) {
  await authorizeCategoryManagement();

  try {
    await deleteSubcategoryUseCase(params);
    return { success: true };
  }
  catch (error) {
    console.error("Error deleting subcategory:", error);
    return { success: false, error: "Failed to delete subcategory" };
  }
  finally {
    // A failed cleanup may already have made the Subcategory inactive. Expire
    // both views so the admin and public surface observe that safe boundary.
    revalidateTag("categories", "max");
    updateTag("categories");
    invalidateActivityAreaAdvertisers([params]);
  }
}
