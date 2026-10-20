"use server";

import { revalidateTag, updateTag } from "next/cache";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { deleteCategoryUseCase } from "@/packages/classifieds-api";
import type { DeleteCategoryInput } from "@tudomacae/categories/validation";

export async function deleteCategory(params: DeleteCategoryInput) {
  await authorizeCategoryManagement();

  try {
    await deleteCategoryUseCase(params);
    return { success: true };
  }
  catch (error) {
    console.error("Error deleting category:", error);
    return { success: false, error: "Failed to delete category" };
  }
  finally {
    // A partial deletion already closes profile discovery for this Category.
    revalidateTag("categories", "max");
    updateTag("categories");
  }
}
