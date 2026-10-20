import { createCategory } from "@/features/categories/actions/createCategory";
import { CategoryForm } from "@tudomacae/categories/ui";

export default function NewCategoryPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 text-2xl font-bold">Nova Categoria</h2>
      <CategoryForm onSubmit={createCategory} />
    </div>
  );
}
