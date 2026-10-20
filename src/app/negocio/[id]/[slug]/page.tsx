import { AdPageHeading } from "@/features/ads/components/AdPageHeading";
import { isPublicAdProfileId } from "@tudomacae/ads/publicDiscovery";
import { AdCursorRecovery } from "@/features/ads/components/AdCursorRecovery";
import { adPageRedirectPath, recoverAdPage } from "@/features/ads/utils/recoverAdPage";
import { AdPagination } from "@/features/ads/components/AdPagination";
import { PublicOfferingCatalog } from "@/features/business-offering-catalog/PublicOfferingCatalog";
import { offeringCatalog } from "@/packages/classifieds-api/offerings";
import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, UserRound } from "lucide-react";
import { IdentityPublicImage } from "@/integrations/advertiser-identity/rendering";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { IdentityAvatar } from "@tudomacae/advertiser-identity/presentation";
import { AdGrid } from "@/features/ads/components/AdGrid";
import { listAdsByProfilePage } from "@/features/ads/actions/listAdsByProfile";
import { AdvertiserContactList } from "@/features/advertiser-profile/components/AdvertiserContactList";
import { BusinessNavigationFocusHeading } from "@/features/business/BusinessNavigationFocus";
import { BusinessAdministrationStatus } from "@/features/business/BusinessAdministrationStatus";
import type { Category } from "@tudomacae/categories/model";
import { getCategories } from "@/features/categories/actions/getCategories";
import { resolveBusinessActivities } from "@/features/business/resolveBusinessActivities";
import { getBusinessUseCase } from "@/packages/classifieds-api";
import {
  businessCanonicalPath,
  businessMetadataDescription,
} from "@tudomacae/advertiser-identity/businessPresentation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { createOpenGraph } from "@/lib/socialMetadata";

type BusinessPageProps = PageProps<"/negocio/[id]/[slug]">;

export async function generateMetadata({ params }: BusinessPageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  if (!isPublicAdProfileId(id)) notFound();
  const business = await getBusinessUseCase({ id });
  if (!business) return { title: "Negócio não encontrado | Tudo Macaé" };
  const title = `${business.title} em Macaé | Tudo Macaé`;
  const description = businessMetadataDescription(business);
  const canonicalPath = businessCanonicalPath(business);
  return {
    title,
    description,
    other: siteSearchResultTypeMeta("business"),
    openGraph: createOpenGraph({
      title: business.title,
      description,
      url: canonicalPath,
      ...(business.photoURL
        ? { images: [{ url: business.photoURL, alt: business.title }] }
        : {}),
    }),
    alternates: { canonical: canonicalPath },
  };
}

export default function BusinessPage(props: BusinessPageProps) {
  return <Suspense fallback={<Loading className="min-h-96" />}><BusinessContent {...props} /></Suspense>;
}

async function BusinessContent({ params, searchParams }: BusinessPageProps) {
  await connection();
  const { id, slug } = await params;
  if (!isPublicAdProfileId(id)) notFound();
  const query = await searchParams;
  const cursor = query.adCursor;
  const [business, categories, adPage] = await Promise.all([
    getBusinessUseCase({ id }),
    getCategories(),
    recoverAdPage(() => listAdsByProfilePage(id, cursor)),
  ]);
  if (!business) notFound();
  const canonicalPath = businessCanonicalPath(business);
  if (!canonicalPath.endsWith(`/${slug}`)) permanentRedirect(adPageRedirectPath(canonicalPath, cursor, adPage));
  const activities = resolveBusinessActivities(business.activityAreas, categories);
  const firstActivity = activities[0];

  return (
    <main className="
      container mx-auto px-4 py-8
      sm:py-12
    "
    >
      <Link
        href="/negocios"
        className="
          inline-flex min-h-11 items-center gap-2 font-medium text-primary
          underline-offset-4
          hover:underline
        "
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para Negócios
      </Link>

      <article className="mx-auto mt-6 max-w-5xl">
        <header className="
          grid gap-6 border-b border-foreground/20 pb-8
          sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-start
        "
        >
          <IdentityAvatar
            Image={IdentityPublicImage}
            src={business.photoURL}
            alt={business.title}
            width={96}
            height={96}
            imageClassName="aspect-square size-full object-cover"
            className="size-24 rounded-2xl"
            fallbackClassName="rounded-2xl bg-primary/10 text-primary"
            fallback={<UserRound aria-hidden="true" className="size-10" />}
          />
          <div>
            <BusinessNavigationFocusHeading href={canonicalPath} title={business.title} />
            {business.description && (
              <p className="mt-4 max-w-[70ch] text-lg/8 text-muted-foreground">
                {business.description}
              </p>
            )}
            {activities.length > 0 && (
              <ul
                aria-label="Áreas de atuação"
                className="mt-5 flex flex-wrap gap-2"
              >
                {activities.map(activity => (
                  <li key={`${activity.categoryId}:${activity.subcategoryId}`}>
                    <Link
                      href={activity.href}
                      aria-label={`${activity.categoryName}: ${activity.subcategoryName}`}
                      className="
                        inline-flex min-h-11 items-center gap-1 rounded-md
                        bg-primary/10 px-3 py-2 text-sm font-semibold
                        text-primary
                        hover:bg-primary/15
                        focus-visible:outline-2 focus-visible:outline-offset-2
                      "
                    >
                      <span className="text-muted-foreground">{activity.categoryName}</span>
                      <span aria-hidden="true">›</span>
                      {activity.subcategoryName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <BusinessAdministrationStatus
                isClaimable={business.isClaimable === true}
              />
            </div>
            <AdvertiserContactList
              {...(business.contacts ? { contacts: business.contacts } : {})}
              sourcePath={canonicalPath}
              analytics={{
                source: "business_profile",
                businessId: business.id,
                ...(firstActivity
                  ? { categoryId: firstActivity.categoryId, subcategoryId: firstActivity.subcategoryId }
                  : {}),
              }}
            />
          </div>
        </header>

        <Suspense fallback={null}><BusinessOfferings businessId={id} /></Suspense>

        <BusinessAds
          adPage={adPage}
          cursor={cursor}
          canonicalPath={canonicalPath}
          categories={categories}
          firstActivity={firstActivity}
        />
      </article>
    </main>
  );
}

interface BusinessAdsProps {
  adPage: Awaited<ReturnType<typeof listAdsByProfilePage>> & { invalidCursor?: true };
  cursor: string | string[] | undefined;
  canonicalPath: string;
  categories: Category[];
  firstActivity: ReturnType<typeof resolveBusinessActivities>[number] | undefined;
}

function BusinessAds({ firstActivity, ...listing }: BusinessAdsProps) {
  const { adPage, cursor } = listing;
  if (adPage.items.length > 0 || cursor || adPage.nextCursor || adPage.invalidCursor) {
    return <BusinessAdsSection {...listing} />;
  }
  return <NoBusinessAds firstActivity={firstActivity} />;
}

function BusinessAdsSection({ adPage, cursor, canonicalPath, categories }: Omit<BusinessAdsProps, "firstActivity">) {
  const currentCursor = typeof cursor === "string" ? cursor : undefined;
  return (
    <section
      id="anuncios"
      aria-labelledby="business-ads-title"
      className="mt-10 scroll-mt-36"
    >
      <AdPageHeading
        id="business-ads-title"
        className="mb-5 text-2xl font-semibold tracking-tight"
        cursor={currentCursor}
        invalidCursor={adPage.invalidCursor === true}
      >
        Anúncios deste negócio
      </AdPageHeading>
      {adPage.invalidCursor
        ? <AdCursorRecovery path={canonicalPath} />
        : (
            <>
              <AdGrid ads={adPage.items} categories={categories} />
              <AdPagination path={canonicalPath} nextCursor={adPage.nextCursor} currentCursor={currentCursor} />
            </>
          )}
    </section>
  );
}

function NoBusinessAds({ firstActivity }: Pick<BusinessAdsProps, "firstActivity">) {
  return (
    <section
      aria-label="Situação dos anúncios"
      className="mt-8 border-t border-border pt-6"
    >
      <p className="font-semibold">Sem anúncios publicados agora</p>
      <p className="mt-2 max-w-2xl text-sm/6 text-muted-foreground">
        Este negócio continua disponível no catálogo. Use os contatos acima para falar diretamente com ele.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
        {firstActivity && (
          <Link
            href={firstActivity.href}
            className="
              inline-flex min-h-11 items-center gap-2 text-primary
              hover:underline
            "
          >
            Ver outros em
            {" "}
            {firstActivity.categoryName}
            {" "}
            ›
            {" "}
            {firstActivity.subcategoryName}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
        <Link
          href="/negocios"
          className="
            inline-flex min-h-11 items-center gap-2 text-primary
            hover:underline
          "
        >
          Explorar todos os negócios
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}

async function BusinessOfferings({ businessId }: { businessId: string }) {
  let catalog;
  try {
    catalog = await offeringCatalog.readPublic(businessId);
  }
  catch { return null; }
  return catalog ? <PublicOfferingCatalog key={businessId} businessId={businessId} initial={catalog} /> : null;
}
