import { TaxonomyAdListing } from "@/features/ads/components/TaxonomyAdListing";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { validatedAdPageRedirectPath, recoverAdPage } from "@/features/ads/utils/recoverAdPage";
import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { getFilteredAdsPage } from "@/features/ads/actions/getFilteredAds";
import { getCategories } from "@/features/categories/actions/getCategories";
import { CategoryBusinessPreview } from "@/features/business/CategoryBusinessPreview";
import { DiscoveryLayerNav } from "@/features/business/DiscoveryLayerNav";
import { getCategoryBusinessPreviewOrEmpty } from "@/features/business/getCategoryBusinessPreview";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { createOpenGraph } from "@/lib/socialMetadata";
import { firstDiscoveryLayer } from "@tudomacae/categories/taxonomyPresentation";

type CategoryPageProps = PageProps<"/categoria/[categoryId]/[categorySlug]">;

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params;
  const categories = await getCategories();
  const category = categories.find(c => c.id === categoryId);

  if (!category) {
    return {
      title: "Categoria não encontrada - Tudo Macaé",
    };
  }

  const canonicalUrl = `/categoria/${categoryId}/${category.slug}`;
  const title = `${category.name} em Macaé | Tudo Macaé`;
  const description = `Encontre negócios locais e anúncios de ${category.name} em Macaé. Consulte perfis, publicações e contatos no Tudo Macaé.`;

  return {
    title,
    description,
    other: siteSearchResultTypeMeta("category"),
    openGraph: createOpenGraph({ title, description, url: canonicalUrl }),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function CategoryPage(props: CategoryPageProps) {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <Suspense fallback={<Loading />}>
          <CategoryContent params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function CategoryContent({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string; categorySlug: string }>;
  searchParams: CategoryPageProps["searchParams"];
}) {
  const { categoryId, categorySlug } = await params;
  const categories = await getCategories();
  const category = categories.find(c => c.id === categoryId);

  // Validate ID
  if (!category) {
    notFound();
  }

  const activeSubcategories = category.subcategories.filter(subcategory => subcategory.isActive);
  const query = await searchParams;
  const cursor = query.adCursor;
  if (category.slug !== categorySlug) {
    permanentRedirect(validatedAdPageRedirectPath(`/categoria/${categoryId}/${category.slug}`, cursor, () =>
      publicAdDiscovery.canonical({ scope: { kind: "category", categoryId }, cursor })));
  }
  const [adPage, businesses] = await Promise.all([
    recoverAdPage(() => getFilteredAdsPage({ categoryId, cursor })),
    getCategoryBusinessPreviewOrEmpty(categoryId),
  ]);
  const ads = adPage.items;
  const subcategoryNav = (
    <details className="group mb-8 rounded-xl border border-border bg-muted/40">
      <summary className="
        flex min-h-12 cursor-pointer list-none items-center justify-between
        gap-3 px-4 font-semibold text-primary
        [&::-webkit-details-marker]:hidden
      "
      >
        Explore por subcategoria
        <ChevronDown
          aria-hidden="true"
          className="
            size-5 transition-transform
            group-open:rotate-180
            motion-reduce:transition-none
          "
        />
      </summary>
      <div className="border-t border-border px-4 pb-3">
        {activeSubcategories.length > 0
          ? (
              <ul className="
                grid gap-x-6
                sm:grid-cols-2
                lg:grid-cols-3
              "
              >
                {activeSubcategories.map(subcategory => (
                  <li key={subcategory.id} className="border-b border-border">
                    <Link
                      href={`/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`}
                      className="
                        flex min-h-12 items-center justify-between gap-3
                        rounded-sm py-2 font-medium underline-offset-4
                        hover:text-primary
                        focus-visible:outline-2 focus-visible:outline-offset-2
                      "
                    >
                      {subcategory.name}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-primary"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          : (
              <p className="mt-4 text-sm text-muted-foreground">
                Ainda não há subcategorias ativas nesta categoria.
              </p>
            )}
      </div>
    </details>
  );
  const businessSection = (

    <CategoryBusinessPreview
      category={category}
      categories={categories}
      businesses={businesses}
    />

  );
  const adsSection = (
    <TaxonomyAdListing
      headingId="category-ads-title"
      scopeName={category.name}
      path={`/categoria/${categoryId}/${category.slug}`}
      adPage={adPage}
      cursor={cursor}
      categories={categories}
      compactEmptyState={true}
    />
  );

  return (
    <>
      <header className="mb-6 max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold">{category.name}</h1>
        <p className="text-muted-foreground">
          Encontre negócios locais e anúncios atuais. Escolha uma subcategoria para refinar sua busca.
        </p>
        <DiscoveryLayerNav scopeName={category.name} />
      </header>
      {subcategoryNav}
      {firstDiscoveryLayer(category.preferredLayer, ads.length > 0, businesses.length > 0) === "ads"
        ? (
            <>
              {adsSection}
              <div className="mt-12">{businessSection}</div>
            </>
          )
        : (
            <>
              {businessSection}
              {adsSection}
            </>
          )}
    </>
  );
}
