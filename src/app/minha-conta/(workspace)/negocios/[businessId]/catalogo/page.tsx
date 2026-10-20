import { Suspense } from "react";
import { forbidden, notFound, unauthorized } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { OfferingCatalogManager } from "@/features/business-offering-catalog/OfferingCatalogManager";
import { offeringCatalog } from "@/packages/classifieds-api/offerings";
import { OfferingCatalogError } from "@tudomacae/advertiser-identity/offeringCatalog";
import { Loading } from "@/components/ui/loading";

export default function CatalogPage(props: PageProps<"/minha-conta/negocios/[businessId]/catalogo">) {
  return <Suspense fallback={<Loading />}><CatalogContent {...props} /></Suspense>;
}
async function CatalogContent({ params }: PageProps<"/minha-conta/negocios/[businessId]/catalogo">) {
  await connection();
  const user = await getCurrentUser();
  if (!user) unauthorized();
  const { businessId } = await params;
  let initial;
  try {
    initial = await offeringCatalog.readManagement({ businessId, actor: { id: user.uid, admin: user.isAdmin === true } });
  }
  catch (error) {
    if (error instanceof OfferingCatalogError) {
      if (error.outcome === "authorization") forbidden();
      notFound();
    }
    throw error;
  }
  return <main className="container mx-auto px-4 py-8"><OfferingCatalogManager businessId={businessId} initial={initial} admin={user.isAdmin === true} /></main>;
}
