"use client";
import { createContext, useContext } from "react";
import type { ComponentType, ReactNode } from "react";
import type { CreateSubcategoryInput, UpdateSubcategoryInput, DeleteCategoryInput, DeleteSubcategoryInput } from "../../validation";

type MutationResult = { success: boolean; error?: string };
export interface CategoryUIIntegrations {
  Link: ComponentType<{ href: string; className?: string; title?: string; children: ReactNode }>;
  refresh(): void;
  navigate(href: string): void;
  createSubcategory(input: CreateSubcategoryInput): Promise<MutationResult>;
  updateSubcategory(input: UpdateSubcategoryInput): Promise<MutationResult>;
  deleteSubcategory(input: DeleteSubcategoryInput): Promise<MutationResult>;
  deleteCategory(input: DeleteCategoryInput): Promise<MutationResult>;
  seedCategories(): Promise<void>;
}
const Context = createContext<CategoryUIIntegrations | null>(null);
export function CategoryUIProvider({ integrations, children }: { integrations: CategoryUIIntegrations; children: ReactNode }) {
  return <Context.Provider value={integrations}>{children}</Context.Provider>;
}
export function useCategoryUI(): CategoryUIIntegrations {
  const value = useContext(Context);
  if (!value) throw new Error("CategoryUIProvider is required");
  return value;
}
