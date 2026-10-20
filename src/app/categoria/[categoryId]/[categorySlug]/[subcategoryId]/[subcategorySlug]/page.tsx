import { TaxonomyAdListing } from "@/features/ads/components/TaxonomyAdListing";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { validatedAdPageRedirectPath, recoverAdPage } from "@/features/ads/utils/recoverAdPage";
import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { getFilteredAdsPage } from "@/features/ads/actions/getFilteredAds";
import { ActivityAreaBusinessList } from "@/features/advertiser-profile/components/ActivityAreaBusinessList";
import { getCategories } from "@/features/categories/actions/getCategories";
import { getActivityAreaBusinesses } from "@/features/advertiser-profile/actions/getActivityAreaBusinesses";
import { DiscoveryLayerNav } from "@/features/business/DiscoveryLayerNav";
import { createOpenGraph } from "@/lib/socialMetadata";
import { firstDiscoveryLayer } from "@tudomacae/categories/taxonomyPresentation";

type SubcategoryPageProps
  = PageProps<"/categoria/[categoryId]/[categorySlug]/[subcategoryId]/[subcategorySlug]">;

export async function generateMetadata({
  params,
}: SubcategoryPageProps): Promise<Metadata> {
  const { categoryId, subcategoryId } = await params;
  const categories = await getCategories();
  const category = categories.find(c => c.id === categoryId);
  const subcategory = category?.subcategories.find(
    s => s.id === subcategoryId,
  );

  if (!category || !subcategory) {
    return {
      title: "Subcategoria não encontrada - Tudo Macaé",
    };
  }

  const canonicalUrl = `/categoria/${categoryId}/${category.slug}/${subcategoryId}/${subcategory.slug}`;
  const title = `${subcategory.name} em Macaé | ${category.name} | Tudo Macaé`;
  const description = `Encontre negócios locais e anúncios de ${subcategory.name} em Macaé, na categoria ${category.name}. Veja perfis, publicações e contatos.`;

  return {
    title,
    description,
    other: siteSearchResultTypeMeta("subcategory"),
    openGraph: createOpenGraph({ title, description, url: canonicalUrl }),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function SubcategoryPage(props: SubcategoryPageProps) {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <Suspense fallback={<Loading />}>
          <SubcategoryContent params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function SubcategoryContent({
  params,
  searchParams,
}: {
  params: SubcategoryPageProps["params"];
  searchParams: SubcategoryPageProps["searchParams"];
}) {
  const { categoryId, categorySlug, subcategoryId, subcategorySlug }
    = await params;
  const categories = await getCategories();
  const category = categories.find(c => c.id === categoryId);

  if (!category) {
    notFound();
  }

  const subcategory = category.subcategories.find(
    s => s.id === subcategoryId,
  );

  // Validate Subcategory ID
  if (!subcategory) {
    notFound();
  }

  const query = await searchParams;
  const cursor = query.adCursor;
  if (category.slug !== categorySlug || subcategory.slug !== subcategorySlug) {
    permanentRedirect(validatedAdPageRedirectPath(
      `/categoria/${categoryId}/${category.slug}/${subcategoryId}/${subcategory.slug}`, cursor,
      () => publicAdDiscovery.canonical({ scope: { kind: "subcategory", categoryId, subcategoryId }, cursor }),
    ));
  }
  const [adPage, businesses] = await Promise.all([
    recoverAdPage(() => getFilteredAdsPage({ categoryId, subcategoryId, cursor })),
    getActivityAreaBusinesses({ categoryId, subcategoryId }),
  ]);
  const ads = adPage.items;
  const businessPreview = (
    <ActivityAreaBusinessList
      categoryId={categoryId}
      subcategoryId={subcategoryId}
      subcategoryName={subcategory.name}
      businesses={businesses}
    />
  );
  const adsSection = (
    <TaxonomyAdListing
      headingId="subcategory-ads-title"
      scopeName={subcategory.name}
      path={`/categoria/${categoryId}/${category.slug}/${subcategoryId}/${subcategory.slug}`}
      adPage={adPage}
      cursor={cursor}
      categories={categories}
      compactEmptyState={businesses.length > 0}
    />
  );

  return (
    <>
      <header className="mb-6 max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold">{subcategory.name}</h1>
        <p className="text-muted-foreground">
          Encontre negócios locais e anúncios atuais em
          {" "}
          {subcategory.name}
          , na categoria
          {" "}
          {category.name}
          .
        </p>
        <DiscoveryLayerNav scopeName={subcategory.name} />
      </header>

      {firstDiscoveryLayer(category.preferredLayer, ads.length > 0, businesses.length > 0) === "ads"
        ? (
            <>
              {adsSection}
              {businessPreview}
            </>
          )
        : (
            <>
              {businessPreview}
              {adsSection}
            </>
          )}
    </>
  );
}
