import { OfferingCatalogError } from "@tudomacae/advertiser-identity/offeringCatalog";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { z } from "zod";
import { PublicationRequirementError } from "@tudomacae/ads/publicationEligibility";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { CategoryManagementError } from "@tudomacae/categories/categoryManagement";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
import { AdvertiserIdentityTypeConflict, AdvertiserProfileAccessError, AdvertiserProfileRevisionConflict, AdvertiserProfileCreationPayloadConflict } from "@tudomacae/advertiser-identity/profiles";
import { IdempotencyConflict, PersistenceConflict, PersistenceLimit } from "@tudomacae/classifieds-persistence";
import { classifiedsErrorSchema } from "../protocol";

type ClassifiedsErrorBody = z.infer<typeof classifiedsErrorSchema>;
type ErrorFactory = (error: ClassifiedsErrorBody, message: string) => Error;

const failureSchema = z.object({ error: z.object({ message: z.string(), data: z.object({ classifieds: classifiedsErrorSchema.optional() }).passthrough() }) });

/** Rebuilds each domain error the server serialized, so callers keep handling it by type. */
const remoteErrors: Record<ClassifiedsErrorBody["name"], ErrorFactory> = {
  OfferingCatalogError: error => new OfferingCatalogError(z.enum(["validation", "authorization", "conflict", "disabled", "outside_audience", "unavailable"]).parse(error.code), z.record(z.string(), z.string()).refine(fields => Object.keys(fields).every(key => ["name", "description", "priceMode", "amount", "sourceUrl"].includes(key))).parse(error.details.fieldErrors)),
  AdvertiserProfileAccessError: error => new AdvertiserProfileAccessError(error.code === "not-found" ? "not-found" : "forbidden"),
  AdvertiserProfileRevisionConflict: error => new AdvertiserProfileRevisionConflict(z.number().parse(error.details.currentRevision)),
  AdvertiserProfileCreationPayloadConflict: error => new AdvertiserProfileCreationPayloadConflict(z.string().parse(error.details.profileId)),
  AdvertiserIdentityTypeConflict: error => new AdvertiserIdentityTypeConflict(z.enum(["personal-exists", "already-classified"]).parse(error.code)),
  CategoryManagementError: (error, message) => new CategoryManagementError(z.enum(["validationFailed", "duplicate", "notFound", "conflict"]).parse(error.code), message),
  AdvertiserProfileAdministrationError: (error, message) => new AdvertiserProfileAdministrationError(z.enum(["notFound", "stateMismatch", "invalidProfileState", "hasAds", "revisionConflict", "possibleDuplicate", "duplicateConfirmationChanged", "idempotencyConflict", "imageCleanupBlocked"]).parse(error.code), message, error.details),
  PublicationRequirementError: error => new PublicationRequirementError(z.enum(["email", "profile"]).parse(error.code), z.array(z.enum(["title", "contact"])).parse(error.details.missing)),
  AdOperationError: (error, message) => new AdOperationError(z.enum(["conflict", "forbidden", "not-found"]).parse(error.code), message),
  PhotoError: error => new PhotoError(z.enum(["invalid", "forbidden", "conflict", "retired", "unavailable", "rate_limit"]).parse(error.code), "Não foi possível confirmar as fotos. Releia a publicação antes de tentar novamente."),
  ValidationError: (_error, message) => new TypeError(message),
  IdempotencyConflict: () => new IdempotencyConflict(),
  PersistenceConflict: () => new PersistenceConflict(),
  PersistenceLimit: () => new PersistenceLimit(),
};

/** Returns the domain error a failed response carries, or undefined when it carries none. */
export function remoteClassifiedsError(value: unknown) {
  const failure = failureSchema.safeParse(value);
  const error = failure.data?.error.data.classifieds;
  if (!failure.success || !error) return undefined;
  return remoteErrors[error.name](error, failure.data.error.message);
}
