import { vi } from "vitest";
import { createMediaUploadFinalization, type MediaUploadReservation, type FinalizedMediaRecord, type MediaUploadFinalizationDependencies } from "../uploadFinalization";
import type { MediaMetadata } from "../model";

export const reservationId = "a".repeat(64);
export const finalizeInput = { reservationId, idempotencyKey: "input-key" };
export function finalizationFixture() {
  let time = 1000;
  let reservation: MediaUploadReservation = {
    id: reservationId, ownerId: "owner", createdAt: 1, expiresAt: 600000, cleanupAt: 86400000, cleanupPending: true, status: "prepared",
    input: { idempotencyKey: "upload", size: 100, contentType: "image/png", metadata: {
      kind: "article-image", alt: "Praia", caption: "", provenance: { origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1 },
    } },
  };
  const canonical = new Map<string, { id: string; metadata: MediaMetadata }>();
  const created: FinalizedMediaRecord[] = [];
  const store: MediaUploadFinalizationDependencies["store"] = {
    async transact(_id, decide) {
      let next = reservation;
      let media: { record: FinalizedMediaRecord; digest: string } | undefined;
      const result = await decide({
        read: async () => structuredClone(reservation),
        readCanonical: async digest => canonical.get(digest) ?? null,
        update: (fields) => { next = { ...next, ...fields }; },
        createMedia: (record, digest) => {
          media = { record, digest };
          return "media";
        },
      });
      reservation = next;
      if (media) {
        created.push(media.record);
        canonical.set(media.digest, { id: "media", metadata: { kind: media.record.kind, alt: media.record.alt, caption: media.record.caption, provenance: media.record.provenance } });
      }
      return result;
    },
  };
  const transact = vi.spyOn(store, "transact");
  const readUpload = vi.fn(async () => new Uint8Array([1]));
  const sanitize = vi.fn(async () => ({ bytes: new Uint8Array([2]), digest: "digest" }));
  const storeMedia = vi.fn(async () => "media-staged/digest.webp");
  const finalization = createMediaUploadFinalization({ now: () => time, store, readUpload, sanitize, storeMedia });
  return { finalization, transact, readUpload, sanitize, storeMedia, canonical, created,
    advance: (value: number) => { time = value; },
    seed: (fields: Partial<MediaUploadReservation>) => { reservation = { ...reservation, ...fields }; },
    metadata: reservation.input.metadata,
  };
}
