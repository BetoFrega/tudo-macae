"use server";

import { randomUUID } from "node:crypto";
import { revalidateTag, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { createManagedCategoryUseCase } from "@/packages/classifieds-api";
import type { CreateCategoryInput } from "@tudomacae/categories/validation";

export async function createCategory(params: CreateCategoryInput): Promise<{
  success: boolean;
  error?: string;
}> {
  await authorizeCategoryManagement();

  try {
    await createManagedCategoryUseCase({
      ...params,
      ...(params.icon ? { icon: params.icon } : { icon: undefined }),
      idempotencyKey: randomUUID(),
    });
    revalidateTag("categories", "max");
    updateTag("categories");
  }
  catch (error) {
    console.error("Error creating category:", error);
    return { success: false, error: "Failed to create category" };
  }
  redirect("/admin/categorias");
}
