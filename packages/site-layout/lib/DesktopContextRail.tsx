"use client";

import { ArrowRight } from "lucide-react";
import { useSiteNavigation } from "./navigationIntegration";
import {
  activeCategories,
  navigationSectionForPathname,
  type EditorialNavigationProps,
} from "./navigationModel";

const contextRailLink = `
  inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-sm font-medium
  underline-offset-4 transition-colors
  hover:bg-primary/10 hover:text-primary
  focus-visible:outline-2 focus-visible:outline-offset-2
  motion-reduce:transition-none
`;

export function DesktopContextRail({
  categories,
}: EditorialNavigationProps) {
  const { link: Link, pathname } = useSiteNavigation();
  const section = navigationSectionForPathname(pathname);
  const visibleCategories = activeCategories(categories).slice(0, 4);

  if (section === "business") {
    return (
      <nav
        aria-label="Atalhos de negócios"
        className="flex min-h-11 items-center gap-2 overflow-hidden border-t"
      >
        <Link
          href="/negocios"
          className={`
            ${contextRailLink}
            shrink-0 font-semibold text-primary
          `}
        >
          Negócios
        </Link>
        <span className="truncate px-2 text-sm text-muted-foreground">Catálogo de negócios por categoria</span>
        <Link
          href="/#classificados"
          className={`
            ${contextRailLink}
            ml-auto shrink-0
          `}
        >
          Ver classificados
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </nav>
    );
  }

  if (section === "classifieds") {
    return (
      <nav
        aria-label="Atalhos de classificados"
        className="flex min-h-11 items-center gap-2 overflow-hidden border-t"
      >
        <Link
          href="/#classificados"
          className={`
            ${contextRailLink}
            shrink-0 font-semibold text-primary
          `}
        >
          Classificados
        </Link>
        {visibleCategories.map((category, index) => (
          <Link
            key={category.id}
            href={`/categoria/${category.id}/${category.slug}`}
            className={`
              ${contextRailLink}
              ${index > 1 ? "max-xl:hidden" : ""}
            `}
          >
            {category.name}
          </Link>
        ))}
        <Link
          href="/#classificados"
          className={`
            ${contextRailLink}
            ml-auto shrink-0
          `}
        >
          Todas as categorias
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </nav>
    );
  }

  return null;
}
