import { createPhotoPathPolicy } from "@tudomacae/classifieds-photos/paths";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
import type { IdentityDeletionInput, IdentityDeletionResult, IdentityDeletionStore } from "@tudomacae/advertiser-identity/identityDeletion";
import { offeringCatalogStateSchema } from "@tudomacae/advertiser-identity/offeringCatalog";
import { IdentityCleanupBlocked, IdempotencyConflict, PersistenceConflict, type ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { stableJson } from "@tudomacae/classifieds-persistence/records";
import { allRecords, jsonValue, parseStored, profileData } from "./classifiedsSupport";

const adsSchema = z.object({
  title: z.string().default(""), status: z.string(), categoryId: z.string().default(""), subcategoryId: z.string().optional(),
  images: z.array(z.object({ path: z.string().optional(), pending: z.boolean().optional() })).optional(),
  pendingImageCleanupPaths: z.array(z.string()).optional(), pendingImageCleanupClaims: z.array(z.string()).optional(),
  pendingImageUploadReservations: z.array(z.object({ path: z.string(), expiresAt: z.number().optional() })).optional(),
});
const resultSchema = z.object({
  outcome: z.literal("deleted"), replayed: z.boolean(), profileId: z.string(), revision: z.number(), deletedAds: z.number(),
  effects: z.object({ previousActivityAreas: z.array(z.object({ categoryId: z.string(), subcategoryId: z.string() })), activityAreas: z.array(z.object({ categoryId: z.string(), subcategoryId: z.string() })) }),
  cacheTags: z.array(z.string()), imageCleanupSkippedCount: z.number().optional(),
  photoCleanup: z.discriminatedUnion("status", [z.object({ status: z.literal("scheduled"), operationId: z.string() }), z.object({ status: z.literal("not_required") })]),
});
const requested = (input: IdentityDeletionInput) => jsonValue({ id: input.id, confirmationToken: input.confirmationToken, confirmedTitle: input.confirmedTitle, reason: input.reason });

type DeletionDecision = Parameters<IdentityDeletionStore["delete"]>[1];
function administrationError(error: unknown) {
  if (error instanceof IdempotencyConflict) return new AdvertiserProfileAdministrationError("idempotencyConflict", error.message);
  if (error instanceof PersistenceConflict) return new AdvertiserProfileAdministrationError("revisionConflict", "O perfil ou seu conteúdo mudou. Confira uma nova prévia antes de excluir.");
  if (error instanceof IdentityCleanupBlocked) return new AdvertiserProfileAdministrationError("imageCleanupBlocked", error.message);
  return error;
}

export function createClassifiedsIdentityDeletionStore(dependencies: { persistence: ClassifiedsPersistence; now(): number }): IdentityDeletionStore {
  const { persistence } = dependencies;
  async function snapshot(id: string, time: number) {
    const manifest = await persistence.manifest(id, time);
    const ads = await allRecords(persistence, { kind: "ad", profileId: id }, manifest.version);
    const catalog = await persistence.read("catalog", id);
    if ((await persistence.manifest(id, time)).version !== manifest.version) throw new PersistenceConflict();
    return {
      profile: manifest.profile ? profileData(manifest.profile) : null,
      ads: ads.items.map(record => ({ id: record.id, ...parseStored(adsSchema, record.body) })),
      catalogItems: catalog ? parseStored(offeringCatalogStateSchema, catalog.body).items.map(({ id, name }) => ({ id, name })) : [],
      version: manifest.version,
      evidence: JSON.stringify([id, manifest.version]),
    };
  }
  async function replay(input: IdentityDeletionInput): Promise<IdentityDeletionResult | null> {
    const receipt = await persistence.readReceipt(input.actorId, input.idempotencyKey);
    if (!receipt) return null;
    const envelope = z.object({ profileId: z.string(), requested: z.json(), audit: z.object({ reason: z.string(), channel: z.string() }) }).safeParse(receipt.intent.input);
    if (receipt.intent.operation !== "deleteIdentity" || !envelope.success || envelope.data.profileId !== input.id
      || stableJson(envelope.data.requested) !== stableJson(requested(input))
      || envelope.data.audit.reason !== input.reason) throw new IdempotencyConflict();
    return { ...parseStored(resultSchema, receipt.result), replayed: true };
  }
  async function ownsProfilePhoto(profileId: string, photoPath: string | undefined) {
    const paths = createPhotoPathPolicy(async bytes => createHash("sha256").update(bytes).digest("hex"));
    return photoPath && await paths.owns({ ownerKind: "profile", ownerId: profileId, path: photoPath });
  }
  async function deleteOnce(input: IdentityDeletionInput, decide: DeletionDecision) {
    const prior = await replay(input);
    if (prior) return prior;
    const time = dependencies.now();
    const current = await snapshot(input.id, time);
    const plan = decide(current);
    const operationId = createHash("sha256").update(JSON.stringify([input.actorId, input.idempotencyKey, "photo"])).digest("hex");
    const ownsPhoto = await ownsProfilePhoto(input.id, current.profile?.photoPath);
    const result = { ...plan.result, photoCleanup: ownsPhoto ? { status: "scheduled" as const, operationId } : { status: "not_required" as const } };
    try {
      const committed = await persistence.deleteIdentity({ profileId: input.id, expectedVersion: current.version, now: time,
        intent: { actorId: input.actorId, key: input.idempotencyKey, operation: "deleteIdentity", input: requested(input) },
        audit: { reason: input.reason, channel: input.channel }, result: jsonValue(result),
        correlationId: input.correlationId, photoOperationId: operationId });
      return { ...parseStored(resultSchema, committed.value), replayed: committed.replayed };
    }
    catch (error) {
      const prior = await replay(input);
      if (prior) return prior;
      throw error;
    }
  }
  return {
    read: id => snapshot(id, dependencies.now()),
    async delete(input, decide) {
      try {
        return await deleteOnce(input, decide);
      }
      catch (error) {
        if (!(error instanceof IdempotencyConflict)) {
          const prior = await replay(input);
          if (prior) return prior;
        }
        throw administrationError(error);
      }
    },
  };
}
