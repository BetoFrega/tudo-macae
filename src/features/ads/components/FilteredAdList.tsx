import { ArrowRight, MapPin, Plus } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCategories } from "@/features/categories/actions/getCategories";
import { getFilteredAds } from "../actions/getFilteredAds";
import { AdGrid } from "./AdGrid";

interface FilteredAdListProps {
  categoryId: string;
  subcategoryId?: string;
}

interface FilteredAdEmptyStateProps {
  scopeName: string | undefined;
  compact?: boolean;
}

export function FilteredAdEmptyState({
  scopeName,
  compact = false,
}: FilteredAdEmptyStateProps) {
  const scopeCopy = scopeName ? ` de ${scopeName}` : " nesta categoria";

  return (
    <section
      id="anuncios"
      aria-labelledby="filtered-ads-empty-title"
      className={compact
        ? "my-8 scroll-mt-24 rounded-xl border border-dashed bg-card px-5 py-6"
        : `
          my-8 scroll-mt-24 overflow-hidden rounded-xl border border-dashed
          bg-card px-6 py-10
          sm:px-10 sm:py-12
        `}
    >
      <div className="
        grid items-center gap-10
        md:grid-cols-[1fr_auto]
      "
      >
        <div className="
          max-w-xl text-center
          md:text-left
        "
        >
          <h2
            id="filtered-ads-empty-title"
            className="
              text-2xl font-bold tracking-tight text-balance
              sm:text-3xl
            "
          >
            {compact
              ? `Quer anunciar em ${scopeName ?? "esta categoria"}?`
              : "Você chegou antes dos anúncios"}
          </h2>
          <p className="mt-3 text-base/7 text-muted-foreground">
            {compact
              ? "Ainda não há anúncios ativos aqui. Publique uma oportunidade no Tudo Macaé."
              : `Ainda não há anúncios${scopeCopy}. Seu anúncio pode abrir esta vitrine local.`}
          </p>
          <Button asChild size="lg" className="group mt-6">
            <Link href="/publicar">
              {compact ? "Publicar anúncio grátis" : "Publicar meu anúncio"}
              <ArrowRight
                aria-hidden="true"
                className={`
                  transition-transform duration-200
                  group-hover:translate-x-1
                `}
              />
            </Link>
          </Button>
          {!compact && (
            <p className="mt-3 text-sm text-muted-foreground">
              A publicação básica é gratuita.
            </p>
          )}
        </div>

        {!compact && (
          <div
            aria-hidden="true"
            className="relative mx-auto h-44 w-64 max-w-full"
          >
            <div
              className={`
                absolute inset-x-5 top-4 h-32 rotate-3 rounded-xl border
                border-primary/10 bg-primary/5
              `}
            />
            <div
              className={`
                absolute inset-x-5 top-4 flex h-32 -rotate-2 flex-col
                items-center justify-center rounded-xl border border-primary/25
                bg-background shadow-sm
              `}
            >
              <MapPin className="size-9 text-primary" strokeWidth={1.75} />
              <span className="mt-3 text-sm font-semibold text-primary">
                Seu anúncio começa aqui
              </span>
            </div>
            <div
              className={`
                absolute right-2 bottom-1 flex size-11 items-center
                justify-center rounded-full bg-primary text-primary-foreground
                shadow-md
              `}
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default async function FilteredAdList({
  categoryId,
  subcategoryId,
}: FilteredAdListProps) {
  "use cache";
  cacheLife("minutes");

  const [ads, categories] = await Promise.all([
    getFilteredAds({ categoryId, subcategoryId }),
    getCategories(),
  ]);

  if (ads.length === 0) {
    const category = categories.find(category => category.id === categoryId);
    const subcategory = category?.subcategories.find(
      subcategory => subcategory.id === subcategoryId,
    );

    return (
      <FilteredAdEmptyState scopeName={subcategory?.name ?? category?.name} />
    );
  }

  return <AdGrid ads={ads} categories={categories} />;
}
