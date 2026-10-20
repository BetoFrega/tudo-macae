import { buildMediaUploadPreparation } from "./lib/mediaUploadPreparation";
import type { MediaUploadReservation } from "./lib/mediaUploadReservation";
import type { PreparedMediaUpload } from "./ingestionPolicy";

export type { MediaUploadReservation };
export interface MediaUploadReservationTransaction {
  read(): Promise<MediaUploadReservation | null>;
  create(record: MediaUploadReservation): void;
}
export interface MediaUploadPreparationDependencies {
  now(): number;
  reservationId(operationId: string): string;
  assertPrivateBucket(): Promise<void>;
  store: {
    transact<T>(id: string, decide: (transaction: MediaUploadReservationTransaction) => Promise<T>): Promise<T>;
  };
  sign(reservation: MediaUploadReservation): Promise<PreparedMediaUpload>;
}
export function createMediaUploadPreparation(dependencies: MediaUploadPreparationDependencies) {
  return buildMediaUploadPreparation(dependencies);
}
