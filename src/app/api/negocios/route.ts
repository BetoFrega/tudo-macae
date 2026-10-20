import type { NextRequest } from "next/server";
import { getCategories } from "@/features/categories/actions/getCategories";
import {
  BusinessCatalogCursorError,
} from "@tudomacae/advertiser-identity/business";
import { listBusinessesUseCase } from "@/packages/classifieds-api";

type Category = Awaited<ReturnType<typeof getCategories>>[number];
type Subcategory = Category["subcategories"][number];

function invalidRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function searchParam(request: NextRequest, name: string) {
  return request.nextUrl.searchParams.get(name)?.trim();
}

function invalidQueryMessage(categoryId?: string, subcategoryId?: string, cursor?: string) {
  if (subcategoryId && !categoryId) return "Uma Subcategoria precisa de sua Categoria.";
  if ([categoryId, subcategoryId, cursor].some(value => (value?.length ?? 0) > 2_048)) return "Parâmetros de catálogo inválidos.";
  return null;
}

function catalogFilter(category?: Category, subcategory?: Subcategory) {
  if (category && subcategory) return { activityArea: { categoryId: category.id, subcategoryId: subcategory.id } };
  return category ? { categoryId: category.id } : {};
}

async function resolveCatalogFilter(categoryId?: string, subcategoryId?: string) {
  const categories = await getCategories();
  const category = categoryId
    ? categories.find(candidate => candidate.id === categoryId && candidate.isActive)
    : undefined;
  if (categoryId && !category) return { error: "Categoria inválida." };
  const subcategory = subcategoryId
    ? category?.subcategories.find(candidate =>
        candidate.id === subcategoryId && candidate.isActive)
    : undefined;
  if (subcategoryId && !subcategory) return { error: "Subcategoria inválida." };
  return { filter: catalogFilter(category, subcategory) };
}

export async function GET(request: NextRequest) {
  const categoryId = searchParam(request, "categoria");
  const subcategoryId = searchParam(request, "subcategoria");
  const cursor = searchParam(request, "cursor");

  const invalidQuery = invalidQueryMessage(categoryId, subcategoryId, cursor);
  if (invalidQuery) return invalidRequest(invalidQuery);
  const resolved = await resolveCatalogFilter(categoryId, subcategoryId);
  if ("error" in resolved) return invalidRequest(resolved.error);

  try {
    const page = await listBusinessesUseCase({
      ...resolved.filter,
      ...(cursor ? { cursor } : {}),
    });
    return Response.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  catch (error) {
    if (error instanceof BusinessCatalogCursorError || error instanceof TypeError) {
      return invalidRequest(error.message);
    }
    throw error;
  }
}
