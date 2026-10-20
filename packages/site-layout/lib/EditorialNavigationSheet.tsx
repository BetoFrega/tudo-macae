"use client";

import { Building2, ChevronDown, LayoutGrid } from "lucide-react";
import { useSiteNavigation } from "./navigationIntegration";
import { activeCategories, type EditorialNavigationProps } from "./navigationModel";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@tudomacae/react-primitives/sheet";

const compactLink = `
  inline-flex min-h-11 w-full items-center rounded-md px-3 py-2 text-sm font-medium
  underline-offset-4 transition-colors
  hover:bg-accent hover:text-accent-foreground
  focus-visible:outline-2 focus-visible:outline-offset-2
  motion-reduce:transition-none
`;

export function EditorialNavigationSheet({
  categories,
  trigger,
  registrationAction,
  publishingAction,
}: EditorialNavigationProps & { trigger: ReactNode; registrationAction?: ReactNode; publishingAction?: ReactNode }) {
  const { link: Link } = useSiteNavigation();
  const [open, setOpen] = useState(false);
  const visibleCategories = activeCategories(categories);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        closeLabel="Fechar menu"
        className="
          w-full max-w-md gap-0
          sm:max-w-md
          [&>button]:flex [&>button]:size-11 [&>button]:items-center
          [&>button]:justify-center
        "
      >
        <SheetHeader className="border-b px-7 py-6 pr-16">
          <SheetTitle className="text-xl">Explore o Tudo Macaé</SheetTitle>
          <SheetDescription>Encontre negócios e classificados em Macaé.</SheetDescription>
        </SheetHeader>

        <nav
          aria-label="Mapa do site"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
        >
          {registrationAction && <div className="has-[button]:py-3">{registrationAction}</div>}
          <section
            aria-labelledby="navigation-classifieds-heading"
            className="border-t py-3"
          >
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <h2
                id="navigation-classifieds-heading"
                className="flex items-center gap-2 font-semibold"
              >
                <LayoutGrid aria-hidden="true" className="size-4 text-primary" />
                Classificados
              </h2>
              <SheetClose asChild>
                <Link
                  href="/#classificados"
                  className="
                    inline-flex min-h-11 shrink-0 items-center rounded-md px-2
                    text-sm font-semibold text-primary underline-offset-4
                    hover:underline
                    focus-visible:outline-2 focus-visible:outline-offset-2
                  "
                >
                  Ver todos
                </Link>
              </SheetClose>
            </div>
            {visibleCategories.length > 0 && (
              <details className="group mt-1">
                <summary className="
                  flex min-h-11 cursor-pointer list-none items-center
                  justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium
                  hover:bg-accent
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  [&::-webkit-details-marker]:hidden
                "
                >
                  Explorar categorias
                  <ChevronDown
                    aria-hidden="true"
                    className="
                      size-4 shrink-0 transition-transform
                      group-open:rotate-180
                      motion-reduce:transition-none
                    "
                  />
                </summary>
                <ul className="grid grid-cols-2 items-start gap-1 pb-2">
                  {visibleCategories.map(category => (
                    <li key={category.id}>
                      <SheetClose asChild>
                        <Link
                          href={`/categoria/${category.id}/${category.slug}`}
                          className={compactLink}
                        >
                          {category.name}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section
            aria-labelledby="navigation-business-heading"
            className="border-t py-3"
          >
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <h2
                id="navigation-business-heading"
                className="flex items-center gap-2 font-semibold"
              >
                <Building2 aria-hidden="true" className="size-4 text-primary" />
                Negócios
              </h2>
              <SheetClose asChild>
                <Link
                  href="/negocios?origem=navigation"
                  className="
                    inline-flex min-h-11 shrink-0 items-center rounded-md px-2
                    text-sm font-semibold text-primary underline-offset-4
                    hover:underline
                    focus-visible:outline-2 focus-visible:outline-offset-2
                  "
                >
                  Ver catálogo
                </Link>
              </SheetClose>
            </div>
            <p className="px-3 pb-2 text-sm/6 text-muted-foreground">
              Encontre negócios de Macaé organizados por categoria.
            </p>
          </section>
        </nav>

        <SheetFooter className="
          border-t px-7 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]
        "
        >
          {publishingAction ?? (
            <SheetClose asChild>
              <Button
                asChild
                variant={registrationAction ? "ghost" : "highlight"}
                className="min-h-11 w-full"
              >
                <Link href="/publicar">Anunciar grátis</Link>
              </Button>
            </SheetClose>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
