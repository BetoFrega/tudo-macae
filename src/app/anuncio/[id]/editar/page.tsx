import { notFound, redirect, unauthorized } from "next/navigation";
import { Suspense } from "react";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { Loading } from "@/components/ui/loading";
import { getAdForEdit } from "@/features/ads/actions/getAd";
import AdForm from "@/features/ads/components/AdForm";
import { AdFormProvider } from "@/features/ads/contexts/AdFormContext";
import { getAdvertiserProfileUseCase, getUserAdvertiserProfilesUseCase } from "@/packages/classifieds-api";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";

interface EditAdPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditAdPage({ params }: EditAdPageProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: EditAdPageProps) {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  const { id } = await params;

  const [ad, categories] = await Promise.all([
    getAdForEdit(id, user.uid, user.isAdmin).catch((error) => {
      if (error instanceof AdOperationError && error.code === "not-found") return null;
      if ((error instanceof AdOperationError || error instanceof ClassifiedsRequestError) && error.code === "forbidden") redirect("/");
      if (error instanceof Error && error.message === "Ad not found") return null;
      if (error instanceof Error && error.message.startsWith("Unauthorized")) redirect("/");
      throw error;
    }),
    getCategoriesLive(),
  ]);

  if (!ad) notFound();
  const associatedProfile = user.isAdmin && ad.advertiserProfileId
    ? await getAdvertiserProfileUseCase({ id: ad.advertiserProfileId })
    : null;
  const profileOwnerId = user.isAdmin ? (ad.advertiserProfileId ? associatedProfile?.userId : ad.userId) : user.uid;
  const profiles = profileOwnerId ? await getUserAdvertiserProfilesUseCase(profileOwnerId) : [];

  return (
    <AdFormProvider
      categories={categories}
      profiles={profiles}
      profileManagementHref={profileOwnerId === user.uid ? "/minha-conta/perfis" : undefined}
    >
      <AdForm
        adId={ad.id}
        initialData={{
          categoryId: ad.categoryId,
          subcategoryId: ad.subcategoryId,
          title: ad.title,
          text: ad.text,
          advertiserProfileId: ad.advertiserProfileId,
          status: ad.status,
          images: ad.images,
        }}
      />
    </AdFormProvider>
  );
}
