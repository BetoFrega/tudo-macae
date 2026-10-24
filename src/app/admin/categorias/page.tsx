import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";
import { SeedCategoriesButton } from "@tudomacae/categories/ui";

export default async function AdminCategoriesPage() {
  // The admin panel must always reflect live data, so it reads the
  // persistence uncached. That requires opting out of prerendering.
  await connection();
  const categories = await getCategoriesLive();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Categorias</h2>
        <div className="flex flex-wrap gap-2">
          <SeedCategoriesButton />
          <Button asChild>
            <Link href="/admin/categorias/novo">Nova Categoria</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {categories.map(category => (
          <div
            key={category.id}
            className="flex min-w-0 flex-col gap-4 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className={`
                      text-xl font-semibold
                      hover:underline
                    `}
                  >
                    {/* No prefetch: see `PublicPageLink` in `src/integrations/categories/ui.tsx`. */}
                    <Link href={`/categoria/${category.id}/${category.slug}`} prefetch={false}>
                      {category.name}
                    </Link>
                  </h3>
                  {!category.isActive && (
                    <Badge variant="destructive">Inativo</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Slug:
                  {" "}
                  {category.slug}
                  {" "}
                  | Ordem:
                  {category.order}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/categorias/${category.id}`}>Editar</Link>
                </Button>
              </div>
            </div>

            {category.subcategories.length > 0 && (
              <div className="border-l-2 pl-4">
                <h4 className="mb-2 text-sm font-semibold">Subcategorias</h4>
                <div className="grid gap-2">
                  {category.subcategories.map(sub => (
                    <div
                      key={sub.id}
                      className={`
                        flex items-center justify-between rounded-sm bg-muted
                        p-2 text-sm
                      `}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/categoria/${category.id}/${category.slug}/${sub.id}/${sub.slug}`}
                          prefetch={false}
                          className={`
                            font-medium
                            hover:underline
                          `}
                        >
                          {sub.name}
                        </Link>
                        {!sub.isActive && (
                          <Badge
                            variant="destructive"
                            className="h-5 px-1 text-xs"
                          >
                            Inativo
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          (
                          {sub.slug}
                          )
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {categories.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            Nenhuma categoria encontrada. Use o botão de semear para começar.
          </div>
        )}
      </div>
    </div>
  );
}
