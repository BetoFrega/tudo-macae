import { OfferingCatalogError, type CatalogFlagDecision } from "@tudomacae/advertiser-identity/offeringCatalog";
import { BusinessCatalogCursorError } from "@tudomacae/advertiser-identity/business";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { z } from "zod";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { PublicationRequirementError } from "@tudomacae/ads/publicationEligibility";
import type { ClassifiedsPhotos } from "./classifiedsPhotoHttp";
import { TRPCError } from "@trpc/server";
import { CategoryManagementError } from "@tudomacae/categories/categoryManagement";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
import { AdvertiserIdentityTypeConflict, AdvertiserProfileAccessError, AdvertiserProfileRevisionConflict, AdvertiserProfileCreationPayloadConflict } from "@tudomacae/advertiser-identity/profiles";
import { IdempotencyConflict, PersistenceConflict, PersistenceLimit } from "@tudomacae/classifieds-persistence";
import { classifiedsErrorSchema } from "@tudomacae/classifieds-client/protocol";
import { createClassifiedsCapabilities } from "./classifiedsCapabilities";
import { purgingCanonicalAnswers } from "./classifiedsCanonical";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { readIdentityAccount } from "./db/identityAccounts";
import { StoredClassifiedsDataError } from "./db/classifiedsSupport";

type ClassifiedsErrorShape = z.infer<typeof classifiedsErrorSchema>;

function catalogError(error: unknown) {
  if (error instanceof OfferingCatalogError) return { name: "OfferingCatalogError", code: error.outcome, details: { fieldErrors: error.fieldErrors } };
  if (error instanceof PublicationRequirementError) return { name: error.name, code: error.requirement, details: { missing: error.missing } };
  if (error instanceof AdOperationError) return { name: error.name, code: error.code, details: {} };
  if (error instanceof PhotoError) return { name: error.name, code: error.code, details: {} };
  return undefined;
}

function profileError(error: unknown) {
  if (error instanceof CategoryManagementError || error instanceof AdvertiserProfileAdministrationError) return { name: error.name, code: error.code, details: error instanceof AdvertiserProfileAdministrationError ? error.details : {} };
  if (error instanceof AdvertiserProfileAccessError) return { name: error.name, code: error.reason, details: {} };
  if (error instanceof AdvertiserProfileRevisionConflict) return { name: error.name, details: { currentRevision: error.currentRevision } };
  if (error instanceof AdvertiserProfileCreationPayloadConflict) return { name: error.name, details: { profileId: error.profileId } };
  if (error instanceof AdvertiserIdentityTypeConflict) return { name: error.name, code: error.reason, details: {} };
  return undefined;
}

function persistenceOrValidationError(error: unknown) {
  if (error instanceof IdempotencyConflict || error instanceof PersistenceConflict || error instanceof PersistenceLimit) return { name: error.name, details: {} };
  if (error instanceof z.ZodError || error instanceof TypeError || error instanceof RangeError) return { name: "ValidationError", details: {} };
  return undefined;
}

export function classifiedsError(error: unknown) {
  return catalogError(error) ?? profileError(error) ?? persistenceOrValidationError(error);
}

function isForbidden({ name, code }: ClassifiedsErrorShape) {
  return (name === "OfferingCatalogError" && code === "authorization") || name === "AdvertiserProfileAccessError" || (["AdOperationError", "PhotoError"].includes(name) && code === "forbidden");
}

const conflictNames = ["AdOperationError", "IdempotencyConflict", "PersistenceConflict", "AdvertiserProfileRevisionConflict", "AdvertiserProfileCreationPayloadConflict", "AdvertiserIdentityTypeConflict"];

function isConflict({ name, code }: ClassifiedsErrorShape) {
  return (name === "OfferingCatalogError" && code === "conflict") || conflictNames.includes(name) || (name === "PhotoError" && ["conflict", "retired"].includes(code ?? ""));
}

function procedureCode(error: ClassifiedsErrorShape) {
  if (isForbidden(error)) return "FORBIDDEN";
  if (error.name === "AdOperationError" && error.code === "not-found") return "NOT_FOUND";
  if (error.name === "PhotoError" && error.code === "unavailable") return "INTERNAL_SERVER_ERROR";
  return isConflict(error) ? "CONFLICT" : "BAD_REQUEST";
}

/** Only domain errors carry messages written for people; everything else gets the generic message. */
function hasPublicMessage(cause: unknown): cause is Error {
  return cause instanceof OfferingCatalogError || cause instanceof BusinessCatalogCursorError || cause instanceof CategoryManagementError || cause instanceof AdvertiserProfileAdministrationError || cause instanceof PublicationRequirementError || cause instanceof PhotoError || cause instanceof AdOperationError;
}

export async function classifiedsProcedure<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  }
  catch (cause) {
    const known = classifiedsErrorSchema.safeParse(classifiedsError(cause));
    if (!known.success) throw cause;
    throw new TRPCError({ code: procedureCode(known.data), message: hasPublicMessage(cause)
      ? cause.message
      : "Não foi possível concluir a operação de Classificados.", cause: cause instanceof Error ? cause : undefined });
  }
}
export async function classifiedsContext(dependencies: {
  request: Request; env: Env; accounts: D1Database; persistence?: ClassifiedsPersistence; verifyRuntimeIdentity(): Promise<boolean>; qualification?: () => Promise<boolean>;
  session(): Promise<{ user: { id: string } } | null>;
  photoUrl?: (path: string) => string; photos?: ClassifiedsPhotos;
  offeringFlag?: (id: string) => Promise<CatalogFlagDecision>;
  canonicalCache?: Cache;
}) {
  const qualified = await dependencies.qualification?.().catch(() => false) === true;
  if (!qualified || !dependencies.persistence) throw new TRPCError({ code: "NOT_FOUND" });
  const actor = await classifiedsActor(dependencies);
  const { request, env } = dependencies;
  return purgingCanonicalAnswers(createClassifiedsCapabilities({
    persistence: dependencies.persistence,
    ...(actor ? { actor } : {}),
    correlationId: request.headers.get("x-request-id")!,
    environment: env.WORKERS_ENVIRONMENT, release: env.CF_VERSION_METADATA?.id,
    observeOffering: event => console.info(JSON.stringify({ event: "business_offering_catalog_operation", service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown", release: env.CF_VERSION_METADATA?.id ?? "unknown", correlationId: request.headers.get("x-request-id"), ...event })),
    photoUrl: dependencies.photoUrl, photos: dependencies.photos, offeringFlag: dependencies.offeringFlag,
  }), request, dependencies.canonicalCache, (operation, count) => console.error(JSON.stringify({ event: "classifieds_canonical_purge", service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown", release: env.CF_VERSION_METADATA?.id ?? "unknown", correlationId: request.headers.get("x-request-id"), operation, outcome: "failed", count })));
}

type ActorDependencies = {
  request: Request; env: Env; accounts: D1Database; verifyRuntimeIdentity(): Promise<boolean>;
  session(): Promise<{ user: { id: string } } | null>;
};

/** A service actor header must name a valid uid and come from a verified identity reader; otherwise the session decides. */
async function actorUid(dependencies: ActorDependencies, serviceActor: string | null) {
  if (serviceActor === null) return (await dependencies.session())?.user.id;
  if (!z.string().min(1).max(128).safeParse(serviceActor).success || !(await dependencies.verifyRuntimeIdentity())) throw new TRPCError({ code: "FORBIDDEN" });
  return serviceActor;
}

export async function classifiedsActor(dependencies: ActorDependencies) {
  const { request } = dependencies;
  const serviceActor = request.headers.get("x-classifieds-actor");
  const uid = await actorUid(dependencies, serviceActor);
  const account = uid
    ? await readIdentityAccount(dependencies.accounts, uid).catch((cause: unknown) => {
        if (cause instanceof z.ZodError) throw new StoredClassifiedsDataError(cause);
        throw cause;
      })
    : null;
  if (uid && (!account || account.disabled)) throw new TRPCError({ code: "FORBIDDEN" });
  return account
    ? { uid: account.uid, admin: account.claims.admin === true, editor: account.claims.editor === true, emailVerified: account.emailVerified,
        channel: serviceActor === null ? "administration" as const : "mcp" as const }
    : undefined;
}
