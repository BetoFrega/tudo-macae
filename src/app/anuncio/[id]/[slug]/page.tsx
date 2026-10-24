import { identityDeletionCacheTag } from "@tudomacae/advertiser-identity/identityDeletion";
import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import { formatSaoPauloDate } from "@tudomacae/civil-time";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublicContentShare } from "@/components/public-content-sharing/PublicContentShare";
import { Loading } from "@/components/ui/loading";
import { getAd } from "@/features/ads/actions/getAd";
import { AdGallery } from "@/features/ads/components/AdGallery";
import { AdManagementControls } from "@/features/ads/components/AdManagementControls";
import { AdvertiserProfileAside } from "@/features/advertiser-profile/components/AdvertiserProfileAside";
import type { Category } from "@tudomacae/categories/model";
import { getCategories } from "@/features/categories/actions/getCategories";
import { createOpenGraph, createSocialDescription } from "@/lib/socialMetadata";

interface AdPageProps {
  params: Promise<{
    id: string;
    slug: string;
  }>;
}

export async function generateMetadata(
  props: AdPageProps,
): Promise<Metadata> {
  const { id } = await props.params;
  const ad = await getAd(id);

  if (!ad) {
    return {
      title: "Anúncio não encontrado - Tudo Macaé",
    };
  }

  const description = createSocialDescription(
    ad.text,
    `Veja o anúncio ${ad.title} no Tudo Macaé.`,
  );
  const canonicalUrl = `/anuncio/${id}/${ad.slug}`;

  return {
    title: `${ad.title} - Tudo Macaé`,
    description,
    other: siteSearchResultTypeMeta("ad"),
    openGraph: createOpenGraph({
      title: ad.title,
      description,
      type: "article",
      url: canonicalUrl,
      ...(ad.images[0]
        ? {
            images: [{
              url: ad.images[0].url,
              alt: ad.images[0].title || ad.title,
            }],
          }
        : {}),
    }),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function AdPage(props: AdPageProps) {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            className={`
              h-auto min-h-9 pl-0 wrap-anywhere whitespace-normal transition-all
              hover:pl-2
            `}
          >
            <Link href="/">
              <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
              Voltar para classificados
            </Link>
          </Button>
        </div>
        <Suspense fallback={<Loading />}>
          <DataLoader params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}

async function DataLoader(props: AdPageProps) {
  const { id, slug } = await props.params;

  // Fetch ad to validate slug
  const ad = await getAd(id);
  if (!ad) {
    notFound();
  }

  // If slug is missing or doesn't match, redirect to canonical URL
  if (!slug || slug !== ad.slug) {
    permanentRedirect(`/anuncio/${id}/${ad.slug}`);
  }

  return <CachedContent adId={id} />;
}

async function CachedContent({ adId }: { adId: string }) {
  "use cache";
  cacheLife("minutes");
  cacheTag(identityDeletionCacheTag, `ad-${adId}`);
  const [ad, categories] = await Promise.all([getAd(adId), getCategories()]);

  if (!ad) {
    notFound();
  }

  const category = categories.find(c => c.id === ad.categoryId);
  const subcategory = category?.subcategories.find(
    s => s.id === ad.subcategoryId,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className={`
        grid grid-cols-1 gap-8
        md:grid-cols-3
      `}
      >
        {/* Left Column: Images & Description */}
        <div className={`
          space-y-8
          md:col-span-2
        `}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">{ad.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={category} />
                <SubcategoryBadge category={category} subcategory={subcategory} />
                <span className="ml-2 text-sm text-muted-foreground">
                  {formatSaoPauloDate(ad.createdAt)}
                </span>
              </div>
            </div>
            {ad.status === "active" && (
              <PublicContentShare
                content={{
                  kind: "ad",
                  id: ad.id,
                  title: ad.title,
                  canonicalPath: `/anuncio/${ad.id}/${ad.slug}`,
                }}
              />
            )}
          </div>

          <AdGallery images={ad.images} title={ad.title} />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id={`ad-description-${ad.id}`}
                tabIndex={-1}
                className="text-xl font-semibold"
              >
                Descrição
              </h2>
              <div className="flex flex-wrap gap-2">
                <Suspense>
                  <AdManagementControls adId={ad.id} />
                </Suspense>
              </div>
            </div>

            {ad.status === "paused" && (
              <div className={`
                rounded-md border border-destructive/20 bg-destructive/10 px-4
                py-2 text-center text-destructive
              `}
              >
                Este anúncio está pausado e pode não ter mais validade.
                <br />
                Entre com contato com o anunciante para mais informações.
              </div>
            )}

            <div className="prose max-w-none prose-slate">
              <p className={`
                leading-relaxed whitespace-pre-wrap text-muted-foreground
              `}
              >
                {ad.text}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Advertiser Info */}
        <div className="space-y-6">
          <AdvertiserProfileAside
            profileId={ad.advertiserProfileId}
            adId={ad.id}
            sourcePath={`/anuncio/${ad.id}/${ad.slug}`}
          />
        </div>
      </div>
    </div>
  );
}

interface AdTaxonomyProps {
  category: Category | undefined;
  subcategory: Category["subcategories"][number] | undefined;
}

function CategoryBadge({ category }: Pick<AdTaxonomyProps, "category">) {
  return category?.slug
    ? (
        <Link
          href={`/categoria/${category.id}/${category.slug}`}
          className="no-underline"
        >
          <Badge
            className={`
              cursor-pointer transition-colors
              hover:bg-primary/80
            `}
          >
            {category.name}
          </Badge>
        </Link>
      )
    : (
        <Badge>
          {category?.name || "Sem categoria"}
        </Badge>
      );
}

function SubcategoryBadge({ category, subcategory }: AdTaxonomyProps) {
  return subcategory?.slug && category?.slug
    ? (
        <Link
          href={`/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`}
          className="no-underline"
        >
          <Badge
            variant="outline"
            className={`
              cursor-pointer transition-colors
              hover:bg-accent hover:text-accent-foreground
            `}
          >
            {subcategory.name}
          </Badge>
        </Link>
      )
    : (
        <Badge variant="outline">
          {subcategory?.name || "Sem subcategoria"}
        </Badge>
      );
}
