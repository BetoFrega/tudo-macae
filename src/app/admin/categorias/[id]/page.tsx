import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";
import { updateCategory } from "@/features/categories/actions/updateCategory";
import { CategoryForm, type CategoryFormData } from "@tudomacae/categories/ui";
import { DeleteCategoryButton } from "@tudomacae/categories/ui";
import { SubcategoryList } from "@tudomacae/categories/ui";

interface EditCategoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCategoryPage({
  params,
}: EditCategoryPageProps) {
  const { id } = await params;
  // The admin panel must always reflect live data, so it reads Firestore
  // uncached. That requires opting out of prerendering.
  await connection();
  const categories = await getCategoriesLive();
  const category = categories.find(c => c.id === id);

  if (!category) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Editar Categoria</h2>
        <DeleteCategoryButton id={category.id} />
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <CategoryForm
          initialData={category}
          onSubmit={async (values: CategoryFormData) => {
            "use server";
            return updateCategory({ id: category.id, ...values });
          }}
        />
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <SubcategoryList
          categoryId={category.id}
          categorySlug={category.slug}
          subcategories={category.subcategories}
        />
      </div>
    </div>
  );
}
