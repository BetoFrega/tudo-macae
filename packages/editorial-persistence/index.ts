export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RecordBody = { [key: string]: Json };
export const recordKinds = [
  "article", "publicationReceipt", "media", "mediaRevision", "mediaDigest", "uploadReservation",
  "publicationGrant", "ingestionIntent", "idempotency", "activity", "legacy",
] as const;
export type RecordKind = typeof recordKinds[number];
export interface RecordInput {
  kind: RecordKind;
  id: string;
  body: RecordBody;
  /** Parent scope: the Media ID of a revision, or the source collection of a legacy record. */
  namespace?: string;
  /** Opaque source update version, retained for transfer reconciliation. */
  sourceVersion?: string;
}
export interface StoredRecord extends RecordInput { version: string }
export interface RecordQuery {
  kind: RecordKind;
  /** Grants and receipts of one article. */
  articleId?: string;
  /** Grants of one Media, or articles whose `mediaIds` reference it. */
  mediaId?: string;
  /** Revisions of one Media; the namespace of `mediaRevision`. */
  namespace?: string;
  status?: string;
  /** `media` only: its `kind` field, e.g. `article-image`. */
  mediaKind?: string;
  /** `article` only: inclusive upper bound on `publishedAt`; required by `order: "publishedDesc"`. */
  publishedAtOrBefore?: number;
  /** `uploadReservation` only: pending cleanups due at or before this instant; required by `order: "cleanupAt"`. */
  cleanupDueBy?: number;
  order?: "createdDesc" | "publishedDesc" | "revision" | "cleanupAt";
  after?: string;
  limit?: number;
}
export interface RecordPage {
  items: StoredRecord[];
  scope: string;
  version: number;
  next?: string;
}
export interface OperationIntent {
  actorId: string;
  key: string;
  operation: string;
  input: Json;
}
export interface ReceiptRecord { intent: OperationIntent; result: Json }
export interface Transaction {
  read(kind: RecordKind, id: string, namespace?: string): Promise<StoredRecord | null>;
  page(query: RecordQuery, expectedVersion?: number): Promise<RecordPage>;
  /** Every replacement/removal requires a preceding point read. */
  put(record: RecordInput): void;
  remove(kind: RecordKind, id: string, namespace?: string): void;
}
export interface PersistenceMetrics {
  operation: "read" | "page" | "commit" | "expireActivity";
  statements: number;
  boundBytes: number;
  returnedBytes: number;
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
  maxParameters: number;
  maxSqlBytes: number;
}
export interface EditorialPersistence {
  read(kind: RecordKind, id: string, namespace?: string): Promise<StoredRecord | null>;
  /** Pin all pages to the first page's version; restart if it changes. */
  page(query: RecordQuery, expectedVersion?: number): Promise<RecordPage>;
  /** Coherent point reads, including absences; callback may repeat without effects. */
  snapshot<T>(decide: (reader: Pick<Transaction, "read">) => Promise<T>): Promise<T>;
  /** Decision may repeat on a verified concurrent write; no external effects. */
  transact<T extends Json>(intent: OperationIntent | null, decide: (tx: Transaction) => Promise<T>): Promise<{ value: T; replayed: boolean }>;
  readReceipt(actorId: string, key: string): Promise<ReceiptRecord | null>;
  /** Transfer only: writes an absent record with its source version, or reports an identical one. */
  importRecord(record: RecordInput): Promise<"imported" | "unchanged">;
  importReceipt(record: ReceiptRecord): Promise<"imported" | "unchanged">;
  /** Removes at most one command-sized batch of Activity whose `expiresAt` is due, and returns how many. */
  expireActivity(now: number): Promise<number>;
}
export class PersistenceConflict extends Error {
  constructor() {
    super("O conteúdo mudou. Releia antes de continuar.");
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
