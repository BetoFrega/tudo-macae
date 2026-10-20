"use server";

import { cacheTag } from "next/cache";
import type { Category } from "@tudomacae/categories/model";
import { getCategoriesUseCase } from "@/packages/classifieds-api";

export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheTag("categories");

  return await getCategoriesUseCase();
}

/**
 * Live reads for selected taxonomy/profile administration. Callers opt out of
 * prerendering (`connection()`) because the authority is read on each request.
 */
export async function getCategoriesLive(): Promise<Category[]> {
  return await getCategoriesUseCase();
}
