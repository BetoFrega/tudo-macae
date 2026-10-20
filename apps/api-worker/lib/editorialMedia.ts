import { createHash, randomUUID } from "node:crypto";
import { editorialInventoryMutationCallerDetails, type EditorialCaller } from "@tudomacae/editorial-access/caller";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { createMediaCorrection } from "@tudomacae/editorial-media/mediaCorrection";
import type { CorrectMediaMetadataInput } from "@tudomacae/editorial-media/mediaCorrectionPolicy";
import { createEditorialMediaIngestion, type EditorialMediaIngestionDependencies } from "@tudomacae/editorial-media/mediaIngestion";
import { createMediaCatalog } from "@tudomacae/media/catalog";
import type { PreparedMediaUpload } from "@tudomacae/media/ingestionPolicy";
import { createMediaMetadataRevision } from "@tudomacae/media/metadataRevision";
import { createQuarantineCleanup } from "@tudomacae/media/quarantineCleanup";
import { createMediaSearch } from "@tudomacae/media/search";
import { createMediaUploadFinalization } from "@tudomacae/media/uploadFinalization";
import { createMediaUploadPreparation } from "@tudomacae/media/uploadPreparation";
import { createMediaUploadQueries } from "@tudomacae/media/uploadQueries";
import type { MediaUploadReservation } from "@tudomacae/media/uploadReservation";
import { createMediaCatalogStore, createMediaRevisionStore, createMediaScan, createMediaUploadQueryReader } from "./db/editorialMedia";
import { createMediaCorrectionTransact, createMediaIngestionIntents } from "./db/editorialMediaActivity";
import { createMediaFinalizationStore, createMediaUploadReservationStore, createQuarantineCleanupStore } from "./db/editorialMediaUploads";

/** Byte storage for quarantined uploads and sanitized Media; records never leave the editorial D1. */
export interface MediaBytes {
  assertPrivate(): Promise<void>;
  sign(reservation: MediaUploadReservation): Promise<PreparedMediaUpload>;
  readUpload(reservation: MediaUploadReservation): Promise<Uint8Array>;
  sanitize(bytes: Uint8Array): Promise<{ bytes: Uint8Array; digest: string }>;
  /** Returns the storage path of the sanitized object, which must be idempotent per digest. */
  storeMedia(bytes: Uint8Array, digest: string): Promise<string>;
  removeUpload(reservationId: string): Promise<void>;
}

/** Media use cases over the editorial D1; authorization belongs to the caller. */
export function createEditorialMedia(dependencies: { persistence: EditorialPersistence; bytes: MediaBytes; now?: () => number; newId?: () => string }) {
  const { persistence, bytes } = dependencies;
  const now = dependencies.now ?? Date.now;
  const newId = dependencies.newId ?? randomUUID;
  return {
    catalog: createMediaCatalog({ now, store: createMediaCatalogStore(persistence, newId) }),
    revisions: createMediaMetadataRevision({ now, store: createMediaRevisionStore(persistence) }),
    search: createMediaSearch({ scan: createMediaScan(persistence) }),
    preparation: createMediaUploadPreparation({
      now, reservationId: operationId => createHash("sha256").update(operationId).digest("hex"),
      assertPrivateBucket: bytes.assertPrivate, store: createMediaUploadReservationStore(persistence), sign: bytes.sign,
    }),
    finalization: createMediaUploadFinalization({
      now, store: createMediaFinalizationStore(persistence, newId),
      readUpload: bytes.readUpload, sanitize: bytes.sanitize, storeMedia: bytes.storeMedia,
    }),
    queries: createMediaUploadQueries({ read: createMediaUploadQueryReader(persistence) }),
    quarantine: createQuarantineCleanup({ now, remove: bytes.removeUpload, store: createQuarantineCleanupStore(persistence) }),
  };
}

/** Live editor roles and Source Permissions stay with their owners; the composition only asks them. */
export type EditorialMediaAccess = Pick<EditorialMediaIngestionDependencies, "authorize" | "hasMediaUsePermission">;

/** Editorial channels over the Media use cases: ingestion intents, corrections and their activity in the same D1. */
export function createEditorialMediaOperations(dependencies: { persistence: EditorialPersistence; media: ReturnType<typeof createEditorialMedia>; access: EditorialMediaAccess; now?: () => number; newId?: () => string }) {
  const { persistence, media, access } = dependencies;
  const now = dependencies.now ?? Date.now;
  const newId = dependencies.newId ?? randomUUID;
  const correction = createMediaCorrection({
    now, fingerprint: value => createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    transact: createMediaCorrectionTransact(persistence, { now, newId }),
  });
  return {
    ingestion: createEditorialMediaIngestion({
      ...access, ...createMediaIngestionIntents(persistence, now),
      prepare: media.preparation.prepare,
      readFinalized: async (ownerId, operationId, input) => await media.queries.readFinalized(ownerId, operationId, input) ?? null,
      metadata: media.queries.metadata,
      finalize: media.finalization.finalize,
      search: media.search.search,
    }),
    correction: {
      /** Correction details are plain objects, so only a verified caller with a live editor role reaches the D1. */
      async correct(caller: EditorialCaller, input: CorrectMediaMetadataInput) {
        const details = editorialInventoryMutationCallerDetails(caller);
        await access.authorize(details);
        return correction.correct(details, input);
      },
    },
  };
}
