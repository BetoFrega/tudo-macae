"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { offeringCatalog, observeOfferingCatalogAction } from "@/packages/classifieds-api/offerings";
import { getAdvertiserProfileUseCase } from "@/packages/classifieds-api";
import { isOwnedAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import { OfferingCatalogError, validateOfferingItem } from "@tudomacae/advertiser-identity/offeringCatalog";

type CatalogActor = { id: string; admin: boolean };
type CatalogCommand = { businessId: string; expectedRevision: number; actor: CatalogActor };

async function authorizeCatalogActor(businessId: string): Promise<CatalogActor> {
  const user = await getCurrentUser();
  if (!user) throw new OfferingCatalogError("authorization");
  const actor = { id: user.uid, admin: user.isAdmin === true };
  const business = await getAdvertiserProfileUseCase({ id: businessId });
  if (!business || (!actor.admin && (!isOwnedAdvertiserProfile(business) || business.userId !== actor.id))) throw new OfferingCatalogError("authorization");
  return actor;
}

function offeringItemFromForm(form: FormData, admin: boolean) {
  return {
    ...(form.get("itemId") ? { id: String(form.get("itemId")) } : {}),
    name: form.get("name"), description: form.get("description") ?? "",
    price: { mode: form.get("priceMode"), amount: form.get("amount") },
    ...(admin && form.get("sourceUrl") ? { sourceUrl: String(form.get("sourceUrl")) } : {}),
  };
}

async function applyCatalogOperation(form: FormData, common: CatalogCommand, correlationId: string) {
  const action = form.get("operation");
  if (action === "enablement") {
    if (!common.actor.admin) throw new OfferingCatalogError("authorization");
    return await offeringCatalog.setEnablement({ ...common, enabled: form.get("enabled") === "true", operationId: correlationId });
  }
  if (action === "visibility") {
    return await offeringCatalog.setVisibility({ ...common, itemId: String(form.get("itemId") ?? ""), visible: form.get("visible") === "true" });
  }
  if (action === "save") {
    const item = offeringItemFromForm(form, common.actor.admin);
    validateOfferingItem(item);
    return await offeringCatalog.saveItem({ ...common, item });
  }
  throw new OfferingCatalogError("validation");
}

function revalidateCatalogPresentation(businessId: string) {
  try {
    revalidatePath("/negocio/[id]/[slug]", "page");
    revalidatePath(`/minha-conta/negocios/${businessId}/catalogo`);
  }
  catch (cause) { throw Object.assign(new Error("Catalog presentation update failed"), { code: "catalog_revalidation_failed", cause }); }
}

export async function changeOfferingCatalog(businessId: string, expectedRevision: number, form: FormData) {
  const correlationId = crypto.randomUUID();
  let persisted = false;
  try {
    return await observeOfferingCatalogAction(businessId, correlationId, async () => {
      const actor = await authorizeCatalogActor(businessId);
      const state = await applyCatalogOperation(form, { businessId, expectedRevision, actor }, correlationId);
      persisted = true;
      revalidateCatalogPresentation(businessId);
      return { state };
    });
  }
  catch (error) {
    if (error instanceof OfferingCatalogError) return { error: error.message, fieldErrors: error.fieldErrors };
    return { error: persisted ? "O cadastro foi gravado, mas a atualização da página falhou. Recarregue o catálogo." : "Não foi possível confirmar a gravação. Recarregue o catálogo antes de tentar novamente." };
  }
}
