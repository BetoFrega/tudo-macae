import { z } from "zod";
import { isEdgeRequestId } from "@tudomacae/www-origin-routing/contract";

export const isClassifiedsRequestId = (value: string) => /^[a-f\d-]{36}$/i.test(value) || isEdgeRequestId(value);

export const classifiedsReadOperations = [
  "categories.catalog", "categories.list", "subcategories.list", "subcategories.resolve",
  "profiles.public", "profiles.owned", "profiles.mine", "profiles.forOwner", "profiles.all", "profiles.private", "profiles.area",
  "profiles.admin.list", "profiles.admin.get", "profiles.admin.duplicates",
  "business.read", "business.list", "business.sitemap", "business.preview", "business.areas", "business.assessOwned", "profiles.identity.preview", "offerings.public", "offerings.management", "offerings.available",
  "ads.read", "ads.page", "ads.sitemap", "ads.owned", "ads.all", "ads.forOwner", "ads.forProfile", "publications.read", "publications.mine",
] as const;
export const classifiedsWriteOperations = [
  "categories.create", "categories.update", "categories.delete", "categories.seed",
  "subcategories.create", "subcategories.update", "subcategories.delete",
  "profiles.create", "profiles.update", "profiles.classify", "profiles.admin.create", "profiles.admin.update", "profiles.admin.delete",
  "profiles.identity.delete", "offerings.save", "offerings.visibility", "offerings.enablement",
  "ads.create", "ads.update", "ads.status", "ads.delete", "publications.save", "publications.profile", "publications.photos", "publications.publish", "publications.delete",
] as const;
export type ClassifiedsReadOperation = typeof classifiedsReadOperations[number];
export type ClassifiedsWriteOperation = typeof classifiedsWriteOperations[number];
export const classifiedsReadInput = z.strictObject({ operation: z.enum(classifiedsReadOperations), input: z.json().default(null) });
export const classifiedsWriteInput = z.strictObject({ operation: z.enum(classifiedsWriteOperations), input: z.json().default(null) });
export const classifiedsErrorSchema = z.object({
  name: z.enum(["OfferingCatalogError", "CategoryManagementError", "AdvertiserProfileAdministrationError", "AdvertiserProfileAccessError", "AdvertiserProfileRevisionConflict", "AdvertiserProfileCreationPayloadConflict", "AdvertiserIdentityTypeConflict", "IdempotencyConflict", "PersistenceConflict", "PersistenceLimit", "ValidationError", "PublicationRequirementError", "PhotoError", "AdOperationError"]),
  code: z.string().optional(), details: z.record(z.string(), z.json()).default({}),
});

export class ClassifiedsRequestError extends Error {
  constructor(readonly code: "unavailable" | "incompatible" | "forbidden", readonly requestId: string, readonly serverReportedFailure = false) {
    super(code === "forbidden" ? "Operação não autorizada." : "Não foi possível concluir a operação de Classificados.");
  }
}
