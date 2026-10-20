import type { FinalizedMediaUpload, PrepareMediaUploadInput } from "../ingestionPolicy";

export interface MediaUploadReservation {
  id: string;
  ownerId: string;
  input: PrepareMediaUploadInput;
  createdAt: number;
  expiresAt: number;
  cleanupAt: number;
  cleanupPending: boolean;
  status: "prepared" | "finalizing" | "finalized" | "expired";
  finalizationId?: string;
  result?: FinalizedMediaUpload;
}

export function quarantinePath(reservationId: string) {
  return `media-quarantine/${reservationId}`;
}
