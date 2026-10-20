import { connection } from "next/server";
import { getCategories } from "@/features/categories/actions/getCategories";
import type { NavigationCategory } from "@tudomacae/site-layout/navigation";

export async function GET() {
  await connection();
  const allCategories = await getCategories();
  const categories: NavigationCategory[] = allCategories
    .filter(category => category.isActive)
    .map(({ id, name, slug, isActive }) => ({ id, name, slug, isActive }));
  return Response.json({ categories, sections: [] }, {
    headers: { "cache-control": "public, max-age=0, s-maxage=60" },
  });
}
