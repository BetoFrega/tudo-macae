"use server";

import { updateTag } from "next/cache";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { seedCategoriesUseCase } from "@/packages/classifieds-api";

export async function seedCategories() {
  await authorizeCategoryManagement();

  await seedCategoriesUseCase();
  updateTag("categories");
}
