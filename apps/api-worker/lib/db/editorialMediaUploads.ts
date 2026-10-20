import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import type { MediaUploadFinalizationDependencies } from "@tudomacae/media/uploadFinalization";
import type { MediaUploadPreparationDependencies } from "@tudomacae/media/uploadPreparation";
import type { MediaUploadReservation } from "@tudomacae/media/uploadReservation";
import type { QuarantineCleanupDependencies } from "@tudomacae/media/quarantineCleanup";
import { z } from "zod";
import { holdsSanitizedAsset, mediaRecord, parseStoredMedia, readPages, readReservation, recordBody, StoredMediaDataError, toMedia, toReservation, transactMedia } from "./editorialMedia";

export function createMediaUploadReservationStore(persistence: EditorialPersistence): MediaUploadPreparationDependencies["store"] {
  return {
    transact: (id, decide) => transactMedia(persistence, async (tx) => {
      const existing = await tx.read("uploadReservation", id);
      return decide({
        read: async () => existing ? toReservation(existing) : null,
        create: record => tx.put({ kind: "uploadReservation", id, body: recordBody(record) }),
      });
    }),
  };
}

/**
 * The digest claim and the candidate Media id are read before `createMedia`, so two finalizations of one
 * sanitized digest conflict on the claim and the retried one reports the canonical Media. A digest record without
 * `mediaId` holds only the sanitized object's journal and counts as unclaimed.
 */
export function createMediaFinalizationStore(persistence: EditorialPersistence, newId: () => string): MediaUploadFinalizationDependencies["store"] {
  return {
    transact: (id, decide) => transactMedia(persistence, async (tx) => {
      let reservation: MediaUploadReservation | null = null;
      let candidate: string | undefined;
      let unclaimed: Record<string, unknown> = {};
      return decide({
        async read() {
          reservation = await readReservation((kind, key) => tx.read(kind, key), id);
          return reservation;
        },
        async readCanonical(digest) {
          const claim = await tx.read("mediaDigest", digest);
          // The sanitized object's journal creates the record before any Media claims it.
          if (!claim?.body.mediaId) {
            unclaimed = claim?.body ?? {};
            candidate = newId();
            await tx.read("media", candidate);
            return null;
          }
          const record = await tx.read("media", parseStoredMedia(z.string(), claim.body.mediaId));
          if (!record) throw new Error(`A Mídia reivindicada pelo digest ${digest} não existe.`);
          const media = toMedia(record);
          const { id: mediaId, kind, alt, caption, provenance } = media;
          // A claim naming Media without this sanitized asset would report an unrelated asset as the canonical duplicate.
          if (!holdsSanitizedAsset(media, digest)) throw new StoredMediaDataError(new Error(`A Mídia ${mediaId} não tem o digest ${digest}.`));
          return { id: mediaId, metadata: { kind, alt, caption, provenance } };
        },
        update(fields) {
          if (!reservation) throw new TypeError("Atualização exige leitura da reserva.");
          reservation = { ...reservation, ...fields };
          tx.put({ kind: "uploadReservation", id, body: recordBody(reservation) });
        },
        createMedia(record, digest) {
          if (!candidate) throw new TypeError("Criação exige leitura do digest.");
          tx.put(mediaRecord({ id: candidate, ...record }));
          tx.put({ kind: "mediaDigest", id: digest, body: recordBody({ ...unclaimed, mediaId: candidate }) });
          return candidate;
        },
      });
    }),
  };
}

const cleanupSchema = z.object({ cleanupPending: z.boolean(), cleanupAt: z.number(), status: z.string() });

export function createQuarantineCleanupStore(persistence: EditorialPersistence): QuarantineCleanupDependencies["store"] {
  return {
    candidates: async (deadline, limit) => (await readPages(persistence, { kind: "uploadReservation", order: "cleanupAt", cleanupDueBy: deadline }, limit))
      .map(record => record.id),
    transact: (id, decide) => transactMedia(persistence, async (tx) => {
      const record = await tx.read("uploadReservation", id);
      return decide({
        // A removed reservation is never eligible, so a stale candidate is skipped.
        read: async () => record ? parseStoredMedia(cleanupSchema, record.body) : { cleanupPending: false, cleanupAt: Number.MAX_SAFE_INTEGER, status: "missing" },
        expire: () => tx.put({ kind: "uploadReservation", id, body: { ...record!.body, status: "expired" } }),
      });
    }),
    markRemoved: (id, cleanedAt) => transactMedia(persistence, async (tx) => {
      const record = await tx.read("uploadReservation", id);
      if (record) tx.put({ kind: "uploadReservation", id, body: { ...record.body, cleanupPending: false, cleanedAt } });
    }),
  };
}
