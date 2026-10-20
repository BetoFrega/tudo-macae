"use server";

import { randomUUID } from "node:crypto";
import { revalidateTag, updateTag } from "next/cache";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { createManagedSubcategoryUseCase } from "@/packages/classifieds-api";
import type { CreateSubcategoryInput } from "@tudomacae/categories/validation";

export async function createSubcategory(params: CreateSubcategoryInput) {
  await authorizeCategoryManagement();

  try {
    await createManagedSubcategoryUseCase({ ...params, idempotencyKey: randomUUID() });
    revalidateTag("categories", "max");
    updateTag("categories");
    return { success: true };
  }
  catch (error) {
    console.error("Error creating subcategory:", error);
    return { success: false, error: "Failed to create subcategory" };
  }
}
