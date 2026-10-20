import { OfferingCatalogEntry } from "@/features/business-offering-catalog/OfferingCatalogEntry";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { getAdvertiserProfile } from "@/features/advertiser-profile/actions/getAdvertiserProfile";
import AdvertiserProfileForm from "@/features/advertiser-profile/components/AdvertiserProfileForm";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";
import { removeUndefinedFields } from "@/lib/utils";
import { connection } from "next/server";
import { identityTypeChoices, withCurrentIdentityType } from "@/features/advertiser-profile/identityTypeChoices";

export default async function EditAdvertiserProfilePage({
  params,
  searchParams,
}: PageProps<"/minha-conta/perfis/[profileId]/editar">) {
  return (
    <Suspense fallback={<Loading />}>
      <AsyncComponent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const AsyncComponent: React.FC<{
  params: PageProps<"/minha-conta/perfis/[profileId]/editar">["params"];
  searchParams: PageProps<"/minha-conta/perfis/[profileId]/editar">["searchParams"];
}> = async ({ params, searchParams }) => {
  await connection();
  const { profileId } = await params;
  const requestedReturn = (await searchParams).returnTo;
  const returnTo
    = typeof requestedReturn === "string"
      && /^\/anuncio\/[a-zA-Z0-9_-]+\/editar$/.test(requestedReturn)
      ? requestedReturn
      : undefined;
  const [profile, categories, choices] = await Promise.all([
    getAdvertiserProfile(profileId),
    getCategoriesLive(),
    identityTypeChoices({ id: profileId }),
  ]);

  if (!profile) {
    notFound();
  }
  const identityTypes = withCurrentIdentityType(choices, profile.identityType);

  return (
    <main className="container mx-auto py-10">
      <Suspense fallback={null}>
        <OfferingCatalogEntry businessId={profile.id} />
      </Suspense>
      <AdvertiserProfileForm
        profileId={profile.id}
        {...(returnTo ? { returnTo } : {})}
        initialData={removeUndefinedFields({
          title: profile.title,
          description: profile.description,
          photoURL: profile.photoURL,
          contacts: profile.contacts,
          activityAreas: profile.activityAreas,
          revision: profile.revision ?? 1,
        })}
        categories={categories}
        {...(identityTypes ? { identityTypes } : {})}
      />
    </main>
  );
};
