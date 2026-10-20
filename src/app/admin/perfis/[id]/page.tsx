import { OfferingCatalogEntry } from "@/features/business-offering-catalog/OfferingCatalogEntry";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { adminGetAdvertiserProfile } from "@/features/advertiser-profile/actions/adminGetAdvertiserProfile";
import AdminAdvertiserProfileForm from "@/features/advertiser-profile/components/AdminAdvertiserProfileForm";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";
import { removeUndefinedFields } from "@/lib/utils";
import { isClaimableAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import { connection } from "next/server";

interface EditAdvertiserProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditAdvertiserProfilePage({
  params,
}: EditAdvertiserProfilePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <AsyncComponent params={params} />
    </Suspense>
  );
}

const AsyncComponent: React.FC<{
  params: EditAdvertiserProfilePageProps["params"];
}> = async ({ params }) => {
  await connection();
  const { id } = await params;
  const [profile, categories] = await Promise.all([
    adminGetAdvertiserProfile(id),
    getCategoriesLive(),
  ]);

  if (!profile) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Editar Perfil de Anunciante</h2>
        <Button variant="outline" asChild>
          <Link href="/admin/perfis">Voltar</Link>
        </Button>
      </div>
      <Suspense fallback={null}>
        <OfferingCatalogEntry businessId={profile.id} />
      </Suspense>
      <AdminAdvertiserProfileForm
        profileId={profile.id}
        initialData={removeUndefinedFields({
          title: profile.title,
          description: profile.description,
          contacts: profile.contacts,
          activityAreas: profile.activityAreas,
          sourceUrl: profile.source?.url,
          claimable: isClaimableAdvertiserProfile(profile),
          revision: profile.revision ?? 1,
        })}
        categories={categories}
      />
    </div>
  );
};
