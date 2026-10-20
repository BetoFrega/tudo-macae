import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Category } from "@tudomacae/categories/model";

interface HomepageCategoryNavProps {
  categories: Category[];
}

export function HomepageCategoryNav({ categories }: HomepageCategoryNavProps) {
  const activeCategories = categories.filter(category => category.isActive);

  if (activeCategories.length === 0) return null;

  return (
    <nav
      aria-label="Categorias de negócios e anúncios"
      className="
        grid grid-cols-2 items-start gap-x-6
        sm:grid-cols-3
        lg:grid-cols-4
      "
    >
      {activeCategories.map((category) => {
        const activeSubcategories = category.subcategories.filter(subcategory => subcategory.isActive);
        const href = `/categoria/${category.id}/${category.slug}`;

        return (
          <details
            key={category.id}
            className="group border-t border-border py-1"
          >
            <summary className="
              flex min-h-12 cursor-pointer list-none items-center
              justify-between gap-2 rounded-sm py-2 text-sm font-semibold
              text-primary
              focus-visible:outline-2 focus-visible:outline-offset-2
              [&::-webkit-details-marker]:hidden
            "
            >
              <span className="min-w-0 wrap-break-word">{category.name}</span>
              <ChevronDown
                aria-hidden="true"
                className="
                  size-4 shrink-0 transition-transform
                  group-open:rotate-180
                  motion-reduce:transition-none
                "
              />
            </summary>
            <ul className="pb-3 text-sm">
              <li>
                <Link
                  href={href}
                  aria-label={`Ver tudo em ${category.name}`}
                  className="
                    flex min-h-11 items-center justify-between gap-2 py-2
                    font-medium text-primary underline-offset-4
                    hover:underline
                  "
                >
                  Ver todos
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                </Link>
              </li>
              {activeSubcategories.map(subcategory => (
                <li key={subcategory.id}>
                  <Link
                    href={`${href}/${subcategory.id}/${subcategory.slug}`}
                    className="
                      flex min-h-11 items-center py-2 text-muted-foreground
                      underline-offset-4
                      hover:text-foreground hover:underline
                    "
                  >
                    {subcategory.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}
