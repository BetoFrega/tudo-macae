import { businessCreationSurface } from "@tudomacae/advertiser-identity/discovery";
import { Suspense } from "react";
import AdvertiserProfileForm from "@/features/advertiser-profile/components/AdvertiserProfileForm";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";
import { Loading } from "@/components/ui/loading";
import { connection } from "next/server";
import { identityTypeChoices } from "@/features/advertiser-profile/identityTypeChoices";

interface CreateAdvertiserProfilePageProps {
  searchParams: Promise<{ origem?: string | string[]; entrada?: string | string[] }>;
}

export default function CreateAdvertiserProfilePage({ searchParams }: CreateAdvertiserProfilePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <CreateAdvertiserProfile searchParams={searchParams} />
    </Suspense>
  );
}

async function CreateAdvertiserProfile({ searchParams }: CreateAdvertiserProfilePageProps) {
  await connection();
  const [categories, params, identityTypes] = await Promise.all([getCategoriesLive(), searchParams, identityTypeChoices()]);
  return (
    <main className="container mx-auto py-10">
      <AdvertiserProfileForm
        categories={categories}
        {...(identityTypes ? { identityTypes } : {})}
        {...(params.origem === "catalogo" ? { creationSource: "catalog" as const, entrySurface: businessCreationSurface(params.entrada) } : {})}
      />
    </main>
  );
}
