import { z } from "zod";
import { createPublicationDrafts, type PublicationDraftStore } from "@tudomacae/ads/publicationDrafts";
import { discardedPublicationPhoto, stagedPublicationPhoto, type publicationPhotosInput } from "@tudomacae/ads/publicationPhotos";
import { photoRecordSchema, type PhotoRecord } from "@tudomacae/classifieds-photos";
import type { PublicationReview } from "@tudomacae/ads/client";
import { PersistenceConflict, type Transaction } from "@tudomacae/classifieds-persistence";
import { jsonValue, parseStored } from "./classifiedsSupport";
import { adSchema, body, forbidden, type StoredAd } from "./classifiedsAdsRecords";
import type { ClassifiedsAdContext } from "./classifiedsAdsContext";
import { draftTransaction } from "./classifiedsAdsDrafts";

/** Owner publication flow: photo selection, publish and draft deletion. */
export function createPublicationWrites(context: ClassifiedsAdContext, drafts: PublicationDraftStore) {
  const { persistence, actorId, now, authority, paths, authorize, cleanup } = context;
  type Reservation = NonNullable<StoredAd["pendingImageUploadReservations"]>[number];
  const reservationsOf = (value: StoredAd): Reservation[] => value.pendingImageUploadReservations ?? [];

  /** A newly selected image must match exactly one unexpired reservation whose staged photo this ad owns. */
  async function readStagedPhoto(tx: Transaction, value: StoredAd, prefix: string, imageId: string) {
    const reservations = reservationsOf(value).filter(reservation => reservation.path.startsWith(`${prefix}${imageId}.`));
    if (reservations.length !== 1 || (reservations[0]!.expiresAt ?? 0) <= now()) throw new PersistenceConflict();
    const photo = await tx.read("retirement", reservations[0]!.path, "classifieds_photos");
    if (!photo) throw new PersistenceConflict();
    const candidate = parseStored(photoRecordSchema, photo.body);
    if (candidate.id !== imageId || candidate.path !== reservations[0]!.path || !await paths.owns(candidate)) throw new PersistenceConflict();
    return candidate;
  }

  async function stagePhotos(tx: Transaction, id: string, value: StoredAd, submission: z.infer<typeof publicationPhotosInput>) {
    const staged = new Map<string, PhotoRecord>();
    const prefix = `${await paths.directory("ad", id)}pending/`;
    for (const imageId of submission.images.map(image => image.id).filter(imageId => !value.images.some(image => image.id === imageId))) {
      staged.set(imageId, await readStagedPhoto(tx, value, prefix, imageId));
    }
    return staged;
  }

  async function assertSelectable(tx: Transaction, id: string, images: StoredAd["images"], staged: Map<string, PhotoRecord>) {
    for (const image of images) {
      const photo = await tx.read("retirement", image.path, "classifieds_photos");
      if (photo && (photo.body.ownerId !== id || (!staged.has(image.id) && photo.body.status !== "linked"))) throw new PersistenceConflict();
    }
  }

  async function discardedReservations(tx: Transaction, id: string, value: StoredAd, images: StoredAd["images"]) {
    const discarded = new Set<string>();
    const selectedPaths = images.map(image => image.path);
    for (const reservation of reservationsOf(value)) {
      const record = await tx.read("retirement", reservation.path, "classifieds_photos");
      if (!record) continue;
      const candidate = parseStored(photoRecordSchema, record.body);
      if (candidate.path === reservation.path && await paths.owns(candidate) && discardedPublicationPhoto(candidate, id, selectedPaths)) discarded.add(candidate.path);
    }
    return discarded;
  }

  function promoteStaged(tx: Transaction, images: StoredAd["images"], staged: Map<string, PhotoRecord>) {
    const promoted = new Set<string>();
    for (const image of images) {
      const photo = staged.get(image.id);
      if (!photo) continue;
      tx.put({ kind: "retirement", id: photo.path, namespace: "classifieds_photos", body: body({ ...photo, status: "linked", updatedAt: now() }) });
      promoted.add(photo.path);
    }
    return promoted;
  }

  return {
    async syncPhotos(id: string, decide: (images: StoredAd["images"]) => StoredAd["images"], submission: z.infer<typeof publicationPhotosInput>) {
      const result = await persistence.transact({ actorId, key: submission.operationId, operation: "publications.photos", input: jsonValue(submission) }, async (tx) => {
        const record = await tx.read("ad", id);
        if (!record) forbidden();
        const value = await authorize(record, tx, false);
        if (value.publicationState !== "pending" || value.images.some(image => image.pending)) throw new PersistenceConflict();
        const staged = await stagePhotos(tx, id, value, submission);
        const available = [...value.images, ...[...staged.values()].map((photo, index) => ({ ...stagedPublicationPhoto(photo, id, now(), value.images.length + index) }))];
        const images = decide(available);
        await assertSelectable(tx, id, images, staged);
        const discarded = await discardedReservations(tx, id, value, images);
        await cleanup(tx, id, [...value.images.filter(image => !images.some(item => item.id === image.id)).map(image => image.path), ...discarded]);
        const promoted = promoteStaged(tx, images, staged);
        tx.put({ ...record, body: body({ ...record.body, images,
          pendingImageUploadReservations: reservationsOf(value).filter(reservation => !promoted.has(reservation.path) && !discarded.has(reservation.path)),
          revision: value.revision + 1 }) });
        return jsonValue(images);
      });
      const current = await persistence.read("ad", id);
      if (!current) forbidden();
      await authorize(current, persistence, false);
      return parseStored(adSchema.shape.images, result.value);
    },
    async publish(id: string, reviewed: PublicationReview | undefined, revision: number | undefined) {
      return (await persistence.transact(null, async (tx) => {
        const existing = await tx.read("ad", id);
        if (!existing) forbidden();
        const value = await authorize(existing, tx, false);
        authority.publish(value, revision);
        const adapter = draftTransaction(context, tx, id);
        const scoped = createPublicationDrafts({ now, authorityMode: "identity", store: { ...drafts, transact: async (_id, decide) => decide(adapter.port) } });
        const result = await scoped.publish(actorId, id, reviewed);
        await scoped.complete(actorId, id, reviewed);
        await adapter.flush();
        return jsonValue(result);
      })).value;
    },
    async deleteDraft(id: string) {
      await persistence.transact(null, async (tx) => {
        const existing = await tx.read("ad", id);
        if (!existing) return null;
        await authorize(existing, tx, false);
        const adapter = draftTransaction(context, tx, id);
        const scoped = createPublicationDrafts({ now, authorityMode: "identity", store: { ...drafts, transact: async (_id, decide) => decide(adapter.port) } });
        await scoped.startDelete(actorId, id);
        await scoped.delete(actorId, id);
        await adapter.flush();
        return null;
      });
    },
  };
}
