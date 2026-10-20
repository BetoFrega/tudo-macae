"use client";
import { useIdentityIntegrations } from "./context";

import { ArrowRight, ChevronRight, Store } from "lucide-react";
import { useState } from "react";
import type { BusinessCategory as Category } from "../../taxonomy";

function activeTaxonomy(categories: Category[]) {
  return categories
    .filter(category => category.isActive)
    .map(category => ({
      ...category,
      subcategories: category.subcategories.filter(subcategory => subcategory.isActive),
    }))
    .filter(category => category.subcategories.length > 0);
}

function CategoryEntry({
  category,
  source,
  initiallyOpen,
}: {
  category: Category;
  source: string;
  initiallyOpen: boolean;
}) {
  const { Link } = useIdentityIntegrations();
  const [open, setOpen] = useState(initiallyOpen);
  const subcategoryListId = `business-subcategories-${category.id}`;

  return (
    <div className="border-b border-border py-2">
      <div className="flex min-h-11 items-center gap-2">
        <Link
          href={`/categoria/${encodeURIComponent(category.id)}/${encodeURIComponent(category.slug)}`}
          className="
            flex min-h-11 flex-1 items-center rounded-md font-medium
            text-primary underline-offset-4
            hover:underline
            focus-visible:outline-2 focus-visible:outline-offset-2
          "
        >
          {category.name}
        </Link>
        <button
          type="button"
          aria-label={`${open ? "Ocultar" : "Mostrar"} subcategorias de ${category.name}`}
          aria-expanded={open}
          aria-controls={subcategoryListId}
          onClick={() => setOpen(value => !value)}
          className="
            flex size-11 shrink-0 items-center justify-center rounded-md
            text-primary
            hover:bg-accent
            focus-visible:outline-2 focus-visible:outline-offset-2
          "
        >
          <ChevronRight
            aria-hidden="true"
            className={`
              size-4 transition-transform
              motion-reduce:transition-none
              ${open
      ? `rotate-90`
      : ""}
            `}
          />
        </button>
      </div>
      <ul id={subcategoryListId} hidden={!open} className="pb-3">
        {category.subcategories.map(subcategory => (
          <li key={subcategory.id}>
            <Link
              href={`/negocios?categoria=${encodeURIComponent(category.id)}&subcategoria=${encodeURIComponent(subcategory.id)}&origem=${encodeURIComponent(source)}#business-results-title`}
              className="
                flex min-h-11 items-center justify-between gap-3 rounded-md px-2
                text-sm text-muted-foreground underline-offset-4
                hover:bg-accent hover:text-foreground
                focus-visible:outline-2 focus-visible:outline-offset-2
              "
            >
              {subcategory.name}
              <ArrowRight aria-hidden="true" className="size-4 text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BusinessCatalogGateway({
  categories,
  source,
  initialCategoryId,
}: {
  categories: Category[];
  source: string;
  initialCategoryId?: string;
}) {
  const taxonomy = activeTaxonomy(categories);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Store aria-hidden="true" className="size-5 text-primary" />
        <h3 className="font-semibold">Explore por categoria</h3>
      </div>
      <div className="grid gap-x-6">
        {taxonomy.map(category => (
          <CategoryEntry
            key={category.id}
            category={category}
            source={source}
            initiallyOpen={category.id === initialCategoryId}
          />
        ))}
      </div>
    </div>
  );
}
