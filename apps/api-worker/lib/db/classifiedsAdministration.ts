import { z } from "zod";
import { IdempotencyConflict, PersistenceConflict, type ClassifiedsPersistence, type Transaction } from "@tudomacae/classifieds-persistence";
import {
  AdvertiserProfileAdministrationError, advertiserProfileAuditRetentionMs, matchAdvertiserProfileDuplicate,
  summarizeAdvertiserProfile, type AdvertiserProfileAdministrationStore, type AdvertiserProfileDuplicateSummary,
} from "@tudomacae/advertiser-identity/administration";
import { isClaimableAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import { normalizeBusinessName } from "@tudomacae/advertiser-identity/business";
import { createPhotoPathPolicy } from "@tudomacae/classifieds-photos/paths";
import { createHash } from "node:crypto";
import { activityAreaActive, allRecords, jsonValue, parseStored, profileData, publicPage } from "./classifiedsSupport";

const areaSchema = z.object({ categoryId: z.string(), subcategoryId: z.string() });
const summarySchema = z.object({ id: z.string(), state: z.enum(["claimable", "owned"]), title: z.string(), activityAreas: z.array(areaSchema), revision: z.number(), createdAt: z.number(), updatedAt: z.number() });
const resultSchema = z.object({
  outcome: z.enum(["created", "updated", "unchanged", "deleted"]), replayed: z.boolean(), profileId: z.string(), revision: z.number(),
  effects: z.object({ previousActivityAreas: z.array(areaSchema), activityAreas: z.array(areaSchema) }), profile: summarySchema.optional(),
  photoCleanup: z.discriminatedUnion("status", [z.object({ status: z.literal("not_required") }), z.object({ status: z.literal("scheduled"), operationId: z.string() })]).optional(),
});
type Failure = Exclude<Awaited<ReturnType<AdvertiserProfileAdministrationStore["create"]>>, { outcome: string }>;
class Refused extends Error {
  constructor(readonly result: Failure) { super(result.status); }
}
class EvidenceRequired extends Error {}

export function createClassifiedsAdministrationStore(dependencies: {
  persistence: ClassifiedsPersistence; now(): number; newId(): string; digest(value: string): string;
  photoUrl?(path: string): string;
}): AdvertiserProfileAdministrationStore {
  const store = dependencies.persistence;
  const photoPaths = createPhotoPathPolicy(async bytes => createHash("sha256").update(bytes).digest("hex"));
  const map = (record: Parameters<typeof profileData>[0]) => profileData(record, dependencies.photoUrl);
  async function duplicates(title: string, contacts: string[]) {
    const normalizedTitle = normalizeBusinessName(title);
    const contactSet = new Set(contacts.map(value => value.replace(/\D/g, "")));
    const records = new Map<string, Parameters<typeof profileData>[0]>();
    const pages = await Promise.all([{ kind: "profile" as const, normalizedTitle }, ...[...contactSet].map(contact => ({ kind: "profile" as const, contact }))]
      .map(query => allRecords(store, query)));
    const version = pages[0]!.version;
    if (pages.some(page => page.version !== version)) throw new PersistenceConflict();
    for (const page of pages) {
      for (const item of page.items) records.set(item.id, item);
    }
    return { version, candidates: [...records.values()].map(item => matchAdvertiserProfileDuplicate(map(item), normalizedTitle, contactSet))
      .filter((item): item is AdvertiserProfileDuplicateSummary => item !== null).sort((left, right) => left.id.localeCompare(right.id)) };
  }
  async function commit(operation: string, input: { actorId: string; idempotencyKey: string }, intent: unknown, decide: (tx: Transaction) => Promise<unknown>) {
    try {
      const result = await store.transact({ actorId: input.actorId, key: input.idempotencyKey, operation, input: jsonValue(intent) }, async tx => jsonValue(await decide(tx)));
      return { ...parseStored(resultSchema, result.value), replayed: result.replayed };
    }
    catch (error) {
      if (error instanceof Refused) return error.result;
      if (error instanceof IdempotencyConflict) return { status: "idempotencyConflict" as const };
      throw error;
    }
  }
  async function audit(tx: Transaction, input: { actorId: string; idempotencyKey: string; channel: string; correlationId?: string }, operation: string, result: z.infer<typeof resultSchema>, previousRevision: number | null, now: number) {
    const id = dependencies.digest(JSON.stringify([input.actorId, input.idempotencyKey]));
    await tx.read("audit", id, "advertiser_profile_administrative_activity");
    tx.put({ kind: "audit", id, namespace: "advertiser_profile_administrative_activity", body: {
      actorId: input.actorId, channel: input.channel, operation, profileId: result.profileId, previousRevision,
      resultingRevision: result.revision, outcome: result.outcome, at: now, createdAt: now, expiresAt: now + advertiserProfileAuditRetentionMs,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    } });
  }
  return {
    async list(input) {
      const page = await publicPage(store, { kind: "profile", claimable: true, order: "createdDesc" }, input.limit, input.cursor, "createdAt");
      return { ...page, items: page.items.map(map).filter(isClaimableAdvertiserProfile).map(summarizeAdvertiserProfile) };
    },
    async get(input) {
      const record = await store.read("profile", input.id);
      return record ? map(record) : { status: "notFound" };
    },
    async findDuplicates(input) {
      const { candidates } = await duplicates(input.title, input.contacts.map(contact => contact.number));
      const query = dependencies.digest(JSON.stringify({ title: normalizeBusinessName(input.title), contacts: input.contacts.map(contact => contact.number.replace(/\D/g, "")).sort() }));
      let lastId: string | undefined;
      if (input.cursor) {
        try {
          const cursor = z.object({ query: z.literal(query), lastId: z.string() }).parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
          lastId = cursor.lastId;
        }
        catch { throw new TypeError("Cursor de duplicatas inválido."); }
      }
      const eligible = candidates.filter(item => lastId === undefined || item.id.localeCompare(lastId) > 0);
      const items = eligible.slice(0, input.limit ?? 20);
      return { items, ...(eligible.length > items.length && items.at(-1) ? { nextCursor: Buffer.from(JSON.stringify({ query, lastId: items.at(-1)!.id })).toString("base64url") } : {}) };
    },
    async create(input, decide) {
      const profileId = dependencies.newId();
      const now = dependencies.now();
      const intent = { state: "claimable", title: input.title.trim(), description: input.description, contacts: input.contacts, activityAreas: input.activityAreas, sourceUrl: input.sourceUrl };
      let evidence: Awaited<ReturnType<typeof duplicates>> | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await commit("create", input, intent, async (tx) => {
            if (!evidence) throw new EvidenceRequired();
            // One guarded query binds the complete indexed evidence gathered outside the bounded transaction.
            await tx.page({ kind: "profile", normalizedTitle: normalizeBusinessName(input.title), limit: 1 }, evidence.version);
            const plan = decide({ profileId, duplicates: evidence.candidates, activityAreas: await Promise.all(input.activityAreas.map(area => activityAreaActive(tx, area))) });
            if ("status" in plan) throw new Refused(plan);
            if (await tx.read("profile", profileId)) throw new PersistenceConflict();
            const { id: _, ...record } = plan.record;
            tx.put({ kind: "profile", id: profileId, body: z.record(z.string(), z.json()).parse(jsonValue(record)) });
            await audit(tx, input, "create", plan.result, null, now);
            return plan.result;
          });
        }
        catch (error) {
          if (!(error instanceof EvidenceRequired) && !(error instanceof PersistenceConflict)) throw error;
          if (attempt === 3) throw error;
          evidence = await duplicates(input.title, input.contacts.map(contact => contact.number));
        }
      }
      throw new PersistenceConflict();
    },
    async update(input, decide) {
      const now = dependencies.now();
      const intent = { id: input.id, expectedState: "claimable", expectedRevision: input.expectedRevision, ...(input.patch ? { patch: input.patch } : {}), ...(input.verifySource ? { verifySource: input.verifySource } : {}) };
      return commit("update", input, intent, async (tx) => {
        const current = await tx.read("profile", input.id);
        const plan = decide({ profile: current ? map(current) : null, activityAreas: await Promise.all((input.patch?.activityAreas ?? []).map(area => activityAreaActive(tx, area))) });
        if ("status" in plan) throw new Refused(plan);
        if (plan.fields) tx.put({ ...current!, body: z.record(z.string(), z.json()).parse(jsonValue({ ...current!.body, ...plan.fields })) });
        await audit(tx, input, "update", plan.result, current ? map(current).revision ?? 1 : null, now);
        return plan.result;
      });
    },
    async delete(input, decide) {
      const now = dependencies.now();
      return commit("delete", input, { id: input.id, expectedState: "claimable", expectedRevision: input.expectedRevision }, async (tx) => {
        const current = await tx.read("profile", input.id);
        const reservations = current?.body.pendingImageUploadReservations;
        const photoReservations = z.array(z.object({ expiresAt: z.number().optional() })).parse(reservations ?? []);
        const ads = await tx.page({ kind: "ad", profileId: input.id, limit: 1 });
        const photoCleanupOperationId = dependencies.digest(JSON.stringify([input.actorId, input.idempotencyKey, "photo"]));
        const plan = decide({ profile: current ? map(current) : null, hasAssociatedAds: ads.items.length > 0, photoCleanupOperationId, photoReservations });
        if ("status" in plan) throw new Refused(plan);
        await tx.read("catalog", input.id);
        if (plan.photoCleanup) {
          if (!await photoPaths.owns({ ownerKind: "profile", ownerId: input.id, path: plan.photoCleanup.photoPath })) throw new AdvertiserProfileAdministrationError("imageCleanupBlocked", "A foto exige reconciliação antes da exclusão.");
          await tx.read("photoCleanup", photoCleanupOperationId);
          tx.put({ kind: "photoCleanup", id: photoCleanupOperationId, body: { profileId: input.id, photoPath: plan.photoCleanup.photoPath, status: "pending", attempts: 0, createdAt: now, updatedAt: now } });
        }
        tx.remove("profile", input.id);
        tx.remove("catalog", input.id);
        await audit(tx, input, "delete", plan.result, current ? map(current).revision ?? 1 : null, now);
        return plan.result;
      });
    },
  };
}
