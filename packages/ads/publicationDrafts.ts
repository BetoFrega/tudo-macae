import { buildPublicationDrafts } from "./lib/publicationDrafts";
export { personalProfileExistsMessage } from "./client";
import type { PendingAdPublication, PublicationContact } from "./client";

export interface PublicationRecord extends PendingAdPublication {
  publicationState?: string;
  status: string;
  slug: string;
  images: NonNullable<PendingAdPublication["images"]>;
  pendingImageCleanupPaths?: string[];
  pendingImageCleanupClaims?: string[];
  pendingImageUploadReservations?: { path: string; expiresAt?: number | undefined }[];
}

export interface PublicationProfileRecord {
  userId?: string | undefined;
  title?: unknown;
  contacts?: unknown;
  revision?: number;
  activityAreas?: PublicationActivityArea[];
}

export interface PublicationActivityArea {
  categoryId: string;
  subcategoryId: string;
}

export interface PublicationProfileWrite {
  userId: string;
  title: string;
  contacts: PublicationContact[];
  updatedAt: number;
  revision: number;
  createdAt?: number;
  description?: string;
  identityType?: "personal" | "business";
  activityAreas?: PublicationActivityArea[];
}

export interface PublicationDraftTransaction {
  read(): Promise<PublicationRecord | null>;
  readProfile(profileId: string): Promise<PublicationProfileRecord | null>;
  /** Absent where the store cannot guarantee one personal profile per account. */
  personalProfileOf?(userId: string): Promise<string | null>;
  /** Absent where the store cannot check the taxonomy; the publication's area is then never declared. */
  isActivityAreaActive?(area: PublicationActivityArea): Promise<boolean>;
  /** Merge profile fields and associate it with this publication atomically. */
  saveProfile(profileId: string, profile: PublicationProfileWrite): void;
  save(record: PublicationRecord): void;
  updatePublication(fields: { publicationState: string; status?: string; slug?: string; updatedAt?: number }): void;
  deletePublication(): void;
}

export interface PublicationDraftStore {
  read(id: string): Promise<PublicationRecord | null>;
  list(userId: string): Promise<PublicationRecord[]>;
  /** Re-runs the decision against fresh reads when a concurrent write wins. */
  transact<T>(id: string, decide: (transaction: PublicationDraftTransaction) => Promise<T>): Promise<T>;
}

export interface PublicationDraftDependencies {
  store: PublicationDraftStore;
  now(): number;
  authorityMode?: "legacy" | "identity";
}

export function createPublicationDrafts(dependencies: PublicationDraftDependencies) {
  return buildPublicationDrafts(dependencies);
}
