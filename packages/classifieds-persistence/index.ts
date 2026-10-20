export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RecordBody = { [key: string]: Json };
export const recordKinds = [
  "category", "subcategory", "profile", "ad", "catalog", "slugClaim",
  "operation", "audit", "adCleanup", "photoCleanup", "retirement",
] as const;
export type RecordKind = typeof recordKinds[number];
export interface RecordInput {
  kind: RecordKind;
  id: string;
  body: RecordBody;
  /** Parent/source collection scope; preserves the original entity ID. */
  namespace?: string;
  /** Opaque source update version, retained for transfer reconciliation. */
  sourceVersion?: string;
}
export interface StoredRecord extends RecordInput { version: string }
export interface RecordQuery {
  kind: RecordKind;
  profileId?: string;
  /** Ads associated with profiles currently owned by this account, plus its unassociated legacy ads. */
  advertiserOwnerId?: string;
  categoryId?: string;
  ownerId?: string;
  subcategoryId?: string;
  status?: string;
  completedPublication?: boolean;
  normalizedTitle?: string;
  /** Profiles whose normalized title starts with this already-normalized prefix. */
  normalizedTitlePrefix?: string;
  contact?: string;
  slug?: string;
  claimable?: boolean;
  activityArea?: { categoryId: string; subcategoryId: string };
  /** `title` orders profiles by normalized title, then ID: the public Business catalog order. */
  order?: "rank" | "rankDesc" | "createdDesc" | "title";
  after?: string;
  limit?: number;
}
export interface RecordPage {
  items: StoredRecord[];
  scope: string;
  version: number;
  next?: string;
}
/** Sitemap projection of one Anúncio; values come from its stored body unvalidated. */
export interface AdSitemapRow { id: string; slug: unknown; lastModified: unknown }
export interface OperationIntent {
  actorId: string;
  key: string;
  operation: string;
  input: Json;
}
export interface ReceiptRecord { intent: OperationIntent; result: Json }
export interface IdentityDeletionAudit { reason: string; channel?: "administration" | "mcp" }
export interface Transaction {
  read(kind: RecordKind, id: string, namespace?: string): Promise<StoredRecord | null>;
  page(query: RecordQuery, expectedVersion?: number): Promise<RecordPage>;
  /** Every replacement/removal requires a preceding point read. */
  put(record: RecordInput): void;
  remove(kind: RecordKind, id: string, namespace?: string): void;
}
export interface IdentityManifest {
  profile: StoredRecord | null;
  version: number;
  adCount: number;
  catalogItemCount: number;
  imageCount: number;
  activeReservations: number;
  legacyImages: number;
  skippedImages: number;
}
export interface PersistenceMetrics {
  operation: "read" | "page" | "commit" | "manifest" | "deleteIdentity" | "expireAudits";
  statements: number;
  boundBytes: number;
  returnedBytes: number;
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
  maxParameters: number;
  maxSqlBytes: number;
}
export interface ClassifiedsPersistence {
  transferVersion(): Promise<number>;
  /** Coherent point reads, including absences; callback may repeat without effects. */
  snapshot<T>(decide: (reader: Pick<Transaction, "read">) => Promise<T>): Promise<T>;
  readReceipt(actorId: string, key: string): Promise<ReceiptRecord | null>;
  receipts(after?: { actorId: string; key: string }): Promise<ReceiptRecord[]>;
  importRecord(record: RecordInput): Promise<"imported" | "unchanged">;
  importReceipt(record: ReceiptRecord): Promise<"imported" | "unchanged">;
  /** Remove at most one command-sized batch of expired audits; preserve receipts. */
  expireAudits(now: number): Promise<number>;
  read(kind: RecordKind, id: string, namespace?: string): Promise<StoredRecord | null>;
  /** Pin all pages to the first page's version; restart if it changes. */
  page(query: RecordQuery, expectedVersion?: number): Promise<RecordPage>;
  /** Newest active, published, non-deleting Anúncios in one statement; `limit` is at most `AD_SITEMAP_READ_LIMIT`. */
  adSitemap(limit: number): Promise<AdSitemapRow[]>;
  /** Decision may repeat on a verified concurrent write; no external effects. */
  transact<T extends Json>(intent: OperationIntent | null, decide: (tx: Transaction) => Promise<T>): Promise<{ value: T; replayed: boolean }>;
  /** Constant-size confirmation evidence; full associated contents are paged. */
  manifest(profileId: string, now: number): Promise<IdentityManifest>;
  /** Caller supplies the authorized, validated deletion intent/result. */
  deleteIdentity<T extends Json>(input: {
    profileId: string;
    expectedVersion: number;
    now: number;
    intent: OperationIntent;
    audit: IdentityDeletionAudit;
    result: T;
    correlationId?: string;
    photoOperationId?: string;
  }): Promise<{ value: T; replayed: boolean }>;
}
export class PersistenceConflict extends Error {
  constructor() {
    super("O conjunto mudou. Releia antes de continuar.");
    this.name = "PersistenceConflict";
  }
}
export class IdempotencyConflict extends Error {
  constructor() {
    super("A chave já identifica outro intento.");
    this.name = "IdempotencyConflict";
  }
}
export class PersistenceLimit extends Error {
  constructor() {
    super("Operação de persistência excede o envelope técnico.");
    this.name = "PersistenceLimit";
  }
}
export class IdentityCleanupBlocked extends Error {
  constructor(message = "Fotos pendentes ou antigas impedem a exclusão.") {
    super(message);
    this.name = "IdentityCleanupBlocked";
  }
}
