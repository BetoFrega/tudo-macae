import Link from "next/link";
import { offeringCatalogAvailable } from "@/packages/classifieds-api/offerings";

export async function OfferingCatalogEntry({ businessId }: { businessId: string }) {
  if (await offeringCatalogAvailable(businessId) !== "enabled") return null;
  return (
    <Link
      href={`/minha-conta/negocios/${businessId}/catalogo`}
      className="
        inline-flex min-h-11 items-center font-semibold text-primary underline
      "
    >
      Gerenciar catálogo do negócio
    </Link>
  );
}
