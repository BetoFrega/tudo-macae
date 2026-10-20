import { StoredClassifiedsDataError } from "./classifiedsSupport";
import { z } from "zod";
import { asBody } from "@tudomacae/classifieds-persistence/records";
import { photoRecordSchema, photoUploadQuotaSchema, type PhotoStore, type PhotoOwner, type PhotoReader } from "@tudomacae/classifieds-photos";
import type { ClassifiedsPersistence, StoredRecord } from "@tudomacae/classifieds-persistence";
import { createPhotoPathPolicy } from "@tudomacae/classifieds-photos/paths";
import { createHash } from "node:crypto";
import { scheduleAdPhotoCleanup } from "./classifiedsAdCleanupJobs";

function stored<T>(parse: () => T): T {
  try {
    return parse();
  }
  catch (cause) { throw new StoredClassifiedsDataError(cause); }
}
const namespace = "classifieds_photos";
const ownerSchema = z.looseObject({
  userId: z.string().optional(), advertiserProfileId: z.string().optional(), revision: z.number().int().positive().default(1),
  deleting: z.boolean().optional(), publicationState: z.string().optional(), photoPath: z.string().optional(),
  images: z.array(z.looseObject({ id: z.string().default(""), path: z.string(), order: z.number().default(0), pending: z.boolean().optional(), title: z.string().optional(), description: z.string().optional() })).default([]),
  pendingImageUploadReservations: z.array(z.object({ path: z.string(), expiresAt: z.number().optional() })).default([]),
});
export function createD1PhotoStore(database: D1Database, persistence: ClassifiedsPersistence): PhotoStore {
  const paths = createPhotoPathPolicy(async bytes => createHash("sha256").update(bytes).digest("hex"));
  function reader(read: ClassifiedsPersistence["read"], remember?: (record: StoredRecord) => void): PhotoReader {
    return {
      async owner(kind, id) {
        const record = await read(kind, id);
        if (!record) return null;
        remember?.(record);
        const body = stored(() => ownerSchema.parse(record.body));
        let userId = body.userId;
        let deleting = body.deleting;
        if (kind === "ad" && body.advertiserProfileId) {
          const profile = await read("profile", body.advertiserProfileId);
          if (!profile) return null;
          const identity = stored(() => ownerSchema.parse(profile.body));
          userId = identity.userId;
          deleting ||= identity.deleting;
        }
        const owner: PhotoOwner = { id, kind, revision: body.revision, userId, deleting,
          publicationState: body.publicationState, photoPath: body.photoPath, images: body.images, reservations: body.pendingImageUploadReservations };
        return owner;
      },
      async photo(path) {
        const record = await read("retirement", path, namespace);
        if (!record) return null;
        const value = stored(() => photoRecordSchema.parse(record.body));
        if (value.path !== path || !await paths.owns(value)) throw new StoredClassifiedsDataError(new TypeError("Referência de arquivo incoerente."));
        return value;
      },
    };
  }
  return {
    read: decide => persistence.snapshot(snapshot => decide(reader(snapshot.read))),
    async transact(decide) {
      let result: { value: Awaited<ReturnType<typeof decide>> } | undefined;
      await persistence.transact(null, async (tx) => {
        const owners = new Map<string, StoredRecord>();
        result = { value: await decide({
          ...reader(tx.read, record => owners.set(`${record.kind}:${record.id}`, record)),
          async quota(accountId) {
            const record = await tx.read("retirement", accountId === null ? "global" : `account:${accountId}`, "classifieds_photo_admission");
            return record ? stored(() => photoUploadQuotaSchema.parse(record.body)) : { uploads: [] };
          },
          saveQuota(accountId, quota) {
            tx.put({ kind: "retirement", id: accountId === null ? "global" : `account:${accountId}`, namespace: "classifieds_photo_admission", body: asBody(JSON.parse(JSON.stringify(quota))) });
          },
          savePhoto(record) {
            tx.put({ kind: "retirement", id: record.path, namespace, body: asBody(JSON.parse(JSON.stringify(record))) });
          },
          saveOwner(owner) {
            const record = owners.get(`${owner.kind}:${owner.id}`);
            if (!record) throw new TypeError("Foto exige leitura do proprietário.");
            const body = { ...record.body, revision: owner.revision, photoPath: owner.photoPath,
              ...(owner.kind === "ad" ? { images: owner.images } : {}), pendingImageUploadReservations: owner.reservations };
            tx.put({ ...record, body: asBody(JSON.parse(JSON.stringify(body))) });
          },
        }) };
        return null;
      });
      if (!result) throw new TypeError("Transação de foto sem resultado.");
      return result.value;
    },
    async deletions(now, limit) {
      const handoff = await database.prepare(`SELECT id FROM classifieds_records INDEXED BY classifieds_photo_handoff_due WHERE kind = 'adCleanup'
        AND json_extract(body, '$.stage') = 'handoff'
        AND coalesce(json_extract(body, '$.status'), 'pending') NOT IN ('completed', 'success')
        AND coalesce(json_extract(body, '$.dueAt'), 0) <= ? ORDER BY coalesce(json_extract(body, '$.dueAt'), 0), id LIMIT 1`).bind(now).first<{ id: string }>();
      if (handoff) await persistence.transact(null, async (tx) => {
        const record = await tx.read("adCleanup", handoff.id);
        if (!record || record.body.status === "completed") return null;
        const manifest = stored(() => z.object({ stage: z.literal("handoff"), adId: z.string(), paths: z.array(z.string()) }).parse(record.body));
        // One slice stays within both the read and write envelopes; the remainder is durable.
        for (const path of manifest.paths.slice(0, 10)) await scheduleAdPhotoCleanup(tx, manifest.adId, path, () => now);
        const paths = manifest.paths.slice(10);
        tx.put({ ...record, body: { ...record.body, paths, status: paths.length ? "pending" : "completed" } });
        return null;
      });
      const rows = await database.prepare(`SELECT kind, id, body FROM classifieds_records INDEXED BY classifieds_photo_individual_deletion_due WHERE kind IN ('adCleanup', 'photoCleanup')
        AND coalesce(json_extract(body, '$.stage'), '') != 'handoff'
        AND coalesce(json_extract(body, '$.status'), 'pending') NOT IN ('completed', 'success')
        AND coalesce(json_extract(body, '$.dueAt'), 0) <= ? ORDER BY coalesce(json_extract(body, '$.dueAt'), 0), kind, id LIMIT ?`).bind(now, limit).all<{ kind: "adCleanup" | "photoCleanup"; id: string; body: string }>();
      return rows.results.map((row) => {
        const body = stored(() => z.object({ path: z.string().optional(), photoPath: z.string().optional() }).refine(value => !!(value.path ?? value.photoPath)).parse(JSON.parse(row.body)));
        return { kind: row.kind, id: row.id, path: body.path ?? body.photoPath ?? "" };
      });
    },
    async deferDeletion(kind, id, retryAt) {
      await persistence.transact(null, async (tx) => {
        const record = await tx.read(kind, id);
        if (record && record.body.status !== "completed") tx.put({ ...record, body: { ...record.body, dueAt: retryAt } });
        return null;
      });
    },
    async completeDeletion(kind, id, path) {
      await persistence.transact(null, async (tx) => {
        const record = await tx.read(kind, id);
        const photo = await tx.read("retirement", path, namespace);
        if (record && stored(() => photoRecordSchema.parse(photo?.body)).status === "retired" && (record.body.path ?? record.body.photoPath) === path) {
          tx.put({ ...record, body: { ...record.body, status: "completed", writerCompleted: true } });
        }
        return null;
      });
    },
    async due(now, limit) {
      const rows = await database.prepare(`SELECT body FROM classifieds_records WHERE kind = 'retirement' AND namespace = 'classifieds_photos'
        AND json_extract(body, '$.status') IN ('reserved', 'retiring') AND json_extract(body, '$.retryAt') <= ?
        AND coalesce(json_extract(body, '$.claimUntil'), 0) <= ? ORDER BY json_extract(body, '$.retryAt'), id LIMIT ?`).bind(now, now, limit).all<{ body: string }>();
      return rows.results.map(row => stored(() => photoRecordSchema.parse(JSON.parse(row.body))));
    },
  };
}
