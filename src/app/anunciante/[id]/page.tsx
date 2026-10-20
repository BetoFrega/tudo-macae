import { AdPageHeading } from "@/features/ads/components/AdPageHeading";
import { isPublicAdProfileId } from "@tudomacae/ads/publicDiscovery";
import { AdCursorRecovery } from "@/features/ads/components/AdCursorRecovery";
import { recoverAdPage } from "@/features/ads/utils/recoverAdPage";
import { AdPagination } from "@/features/ads/components/AdPagination";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { listAdsByProfilePage } from "@/features/ads/actions/listAdsByProfile";
import { AdGrid } from "@/features/ads/components/AdGrid";
import { getPublicAdvertiserProfile } from "@/features/advertiser-profile/actions/getPublicAdvertiserProfile";
import { AdvertiserProfileHeader } from "@/features/advertiser-profile/components/AdvertiserProfileHeader";
import { getCategories } from "@/features/categories/actions/getCategories";

interface AdvertiserPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ adCursor?: string | string[] }>;
}

export default function AdvertiserPage(props: AdvertiserPageProps) {
  return (
    <main className="container mx-auto min-h-screen px-4 py-8">
      <div className="mb-6">
        <Button
          asChild
          variant="ghost"
          className="
            h-auto min-h-9 pl-0 whitespace-normal
            hover:pl-2
          "
        >
          <Link href="/">
            <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
            Voltar para classificados
          </Link>
        </Button>
      </div>
      <Suspense fallback={<Loading />}>
        <LegacyAdvertiserContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function LegacyAdvertiserContent({ params, searchParams }: AdvertiserPageProps) {
  const { id } = await params;
  if (!isPublicAdProfileId(id)) notFound();
  const query = await searchParams;
  const cursor = query.adCursor;
  return <LegacyAdvertiser profileId={id} cursor={cursor} />;
}

async function LegacyAdvertiser({ profileId, cursor }: { profileId: string; cursor?: string | string[] | undefined }) {
  const [profile, adPage, categories] = await Promise.all([
    getPublicAdvertiserProfile(profileId),
    recoverAdPage(() => listAdsByProfilePage(profileId, cursor)),
    getCategories(),
  ]);
  if (!profile) notFound();
  const ads = adPage.items;

  return (
    <div className="space-y-8">
      <AdvertiserProfileHeader profile={profile} sourcePath={`/anunciante/${profile.id}`} />
      <section id="anuncios" className="mx-auto max-w-5xl scroll-mt-36" aria-labelledby="legacy-advertiser-ads">
        <AdPageHeading
          id="legacy-advertiser-ads"
          className="mb-4 text-xl font-semibold"
          cursor={typeof cursor === "string" ? cursor : undefined}
          invalidCursor={adPage.invalidCursor === true}
        >
          Anúncios deste anunciante
        </AdPageHeading>
        {adPage.invalidCursor
          ? <AdCursorRecovery path={`/anunciante/${profileId}`} />
          : (ads.length > 0 || cursor || adPage.nextCursor)
              ? <AdGrid ads={ads} categories={categories} />
              : (
                  <Card>
                    <CardContent className="
                      py-8 text-center text-muted-foreground
                    "
                    >
                      Este anunciante ainda não publicou nenhum anúncio.
                    </CardContent>
                  </Card>
                )}
        {!adPage.invalidCursor && <AdPagination path={`/anunciante/${profileId}`} nextCursor={adPage.nextCursor} currentCursor={typeof cursor === "string" ? cursor : undefined} />}
      </section>
    </div>
  );
}
