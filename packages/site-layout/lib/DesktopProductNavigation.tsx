"use client";

import { ArrowRight, LayoutGrid } from "lucide-react";
import { useSiteNavigation } from "./navigationIntegration";
import {
  activeCategories,
  navigationSectionForPathname,
  type EditorialNavigationProps,
} from "./navigationModel";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@tudomacae/react-primitives/navigation-menu";

const panelLink = `
  group flex min-h-11 flex-row items-center justify-between gap-4 rounded-md
  px-3 py-2 text-sm/5 font-medium underline-offset-4 transition-colors
  motion-reduce:transition-none
  hover:bg-accent hover:text-accent-foreground
  focus-visible:outline-2 focus-visible:outline-offset-2
`;

export function DesktopProductNavigation({
  categories,
}: EditorialNavigationProps) {
  const { link: Link, pathname } = useSiteNavigation();
  const section = navigationSectionForPathname(pathname);
  const visibleCategories = activeCategories(categories).slice(0, 6);

  return (
    <NavigationMenu
      aria-label="Navegação principal"
      className="w-full max-w-full justify-start"
    >
      <NavigationMenuList className="justify-start gap-1">

        <NavigationMenuItem>
          <NavigationMenuTrigger
            data-current={section === "classifieds" ? "true" : "false"}
            className="
              h-11 rounded-md px-3
              data-[current=true]:bg-primary/10 data-[current=true]:text-primary
              data-[state=open]:bg-primary/10 data-[state=open]:text-primary
              data-[state=open]:hover:bg-primary/15
              xl:px-4
            "
          >
            Classificados
          </NavigationMenuTrigger>
          <NavigationMenuContent className="p-0">
            <div className="
              grid min-h-64 w-3xl max-w-[calc(100vw-2rem)]
              md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]
            "
            >
              <NavigationMenuLink asChild>
                <Link
                  href="/#classificados"
                  aria-label="Ver todas as categorias de classificados"
                  className="
                    group flex min-h-64 flex-col justify-between gap-8 bg-muted
                    p-6 outline-none
                    focus-visible:ring-3 focus-visible:ring-ring
                  "
                >
                  <LayoutGrid aria-hidden="true" className="size-6 text-primary" />
                  <span>
                    <span className="block text-xl font-bold tracking-tight">
                      Oportunidades locais
                    </span>
                    <span className="
                      mt-2 block text-sm/relaxed text-muted-foreground
                    "
                    >
                      Produtos, serviços, trabalho e outras oportunidades de Macaé.
                    </span>
                    <span className="
                      mt-5 inline-flex items-center gap-2 text-sm font-semibold
                      text-primary
                    "
                    >
                      Todas as categorias
                      <ArrowRight
                        aria-hidden="true"
                        className="
                          size-4 transition-transform
                          group-hover:translate-x-1
                        "
                      />
                    </span>
                  </span>
                </Link>
              </NavigationMenuLink>

              <div className="p-6">
                <h2 className="text-sm font-semibold text-muted-foreground">Comece por uma categoria</h2>
                {visibleCategories.length > 0
                  ? (
                      <ul className="mt-3 grid grid-cols-2 gap-1">
                        {visibleCategories.map(category => (
                          <li key={category.id}>
                            <NavigationMenuLink asChild>
                              <Link
                                href={`/categoria/${category.id}/${category.slug}`}
                                className={panelLink}
                              >
                                <span>{category.name}</span>
                                <ArrowRight
                                  aria-hidden="true"
                                  className="
                                    size-4 shrink-0 text-primary
                                    transition-transform
                                    group-hover:translate-x-1
                                  "
                                />
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    )
                  : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        As categorias disponíveis aparecerão aqui.
                      </p>
                    )}
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              href="/negocios?origem=navigation"
              data-current={section === "business" ? "true" : "false"}
              className="
                inline-flex h-11 items-center justify-center rounded-md px-3
                text-sm font-medium transition-colors
                hover:bg-accent hover:text-accent-foreground
                focus-visible:outline-2 focus-visible:outline-offset-2
                data-[current=true]:bg-primary/10
                data-[current=true]:text-primary
                motion-reduce:transition-none
                xl:px-4
              "
            >
              Negócios
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
