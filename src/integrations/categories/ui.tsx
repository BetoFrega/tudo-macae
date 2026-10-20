"use client";
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CategoryUIProvider } from "@tudomacae/categories/ui";
import { createSubcategory } from "@/features/categories/actions/createSubcategory";
import { updateSubcategory } from "@/features/categories/actions/updateSubcategory";
import { deleteSubcategory } from "@/features/categories/actions/deleteSubcategory";
import { deleteCategory } from "@/features/categories/actions/deleteCategory";
import { seedCategories } from "@/features/categories/actions/seedCategories";

/** No prefetch: vinext prefetch renders the whole public page and caches its still-empty listings right after an area is created. */
function PublicPageLink(props: Omit<ComponentProps<typeof Link>, "prefetch">) {
  return <Link {...props} prefetch={false} />;
}

export function CategoryUIComposition({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <CategoryUIProvider integrations={{ Link: PublicPageLink, refresh: router.refresh, navigate: router.push, createSubcategory, updateSubcategory, deleteSubcategory, deleteCategory, seedCategories }}>{children}</CategoryUIProvider>;
}
