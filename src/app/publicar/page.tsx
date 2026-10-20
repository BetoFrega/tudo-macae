import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import PublicationJourney, { PublicationRecoveryLogin } from "@/features/ads/components/PublicationJourney";
import { getPendingPublication } from "@/features/ads/actions/publication";
import { AdFormProvider } from "@/features/ads/contexts/AdFormContext";
import { getUserAdvertiserProfiles } from "@/features/advertiser-profile/actions/getUserAdvertiserProfiles";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";

export default function PublishPage({ searchParams }: { searchParams: Promise<{ publication?: string }> }) {
  return (
    <div className="min-h-screen bg-secondary/40">
      <main className="
        container mx-auto px-4 py-8
        sm:py-12
      "
      >
        <Suspense
          fallback={(
            <Loading
              className="
                mx-auto min-h-96 max-w-3xl rounded-xl border bg-background
              "
            />
          )}
        >
          <PublishPageContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function PublishPageContent({ searchParams }: { searchParams: Promise<{ publication?: string }> }) {
  await connection();
  const { publication } = await searchParams;
  if (publication && !await getCurrentUser()) return <PublicationRecoveryLogin />;
  const [categories, profiles, initial] = await Promise.all([
    getCategoriesLive(),
    getUserAdvertiserProfiles(),
    publication ? getPendingPublication(publication) : null,
  ]);

  if (publication && !initial) return <p role="alert">Publicação não encontrada nesta conta.</p>;
  return (
    <AdFormProvider categories={categories} profiles={profiles} profileManagementHref="/minha-conta/perfis">
      <PublicationJourney initial={initial ?? undefined} identityTypes />
    </AdFormProvider>
  );
}
