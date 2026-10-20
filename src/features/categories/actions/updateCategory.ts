"use server";

import { revalidateTag, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { CategoryManagementError, updateManagedCategoryUseCase } from "@/packages/classifieds-api";
import type { z } from "zod";
import type { updateCategoryInputSchema } from "@tudomacae/categories/categoryManagement";

type UpdateCategoryInput = z.input<typeof updateCategoryInputSchema>;

export async function updateCategory(params: UpdateCategoryInput) {
  await authorizeCategoryManagement();

  try {
    await updateManagedCategoryUseCase(params);
    revalidateTag("categories", "max");
    updateTag("categories");
  }
  catch (error) {
    console.error("Error updating category:", error);
    if (error instanceof CategoryManagementError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update category" };
  }
  redirect("/admin/categorias");
}
