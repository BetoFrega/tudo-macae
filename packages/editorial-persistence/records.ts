import { z } from "zod";
import { PersistenceLimit, recordKinds, type Json, type OperationIntent, type ReceiptRecord, type RecordBody, type RecordInput, type RecordKind } from "./index";

/**
 * A Blog save reads and writes its article, receipt, up to 20 Media and the grants
 * it replaces (at most 40 distinct keys), so commands and guards exceed that set.
 */
export const persistenceLimits = {
  recordBytes: 1_000_000,
  pageBytes: 1_024_000,
  pageItems: 25,
  reads: 128,
  commands: 64,
  guards: 96,
  statements: 192,
  attempts: 4,
} as const;

const identifier = z.string().min(1).max(2048).refine(value => byteLength(value) <= 4096, "Identificador excede o envelope técnico.");
const epoch = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const json: z.ZodType<Json> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(z.string(), json),
]));
const body = z.record(z.string(), json);
const input = z.object({ kind: z.enum(recordKinds), id: identifier, body, sourceVersion: identifier.optional(), namespace: identifier.optional() });
/** Source collection names, e.g. `news_stories`; legacy records keep their original IDs inside it. */
const legacyCollection = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Coleção legada inválida.");

// Storage shapes keep legacy fields; product factories own product limits.
const shapes: Partial<Record<RecordKind, z.ZodType>> = {
  article: z.looseObject({ status: z.string(), createdAt: epoch, mediaIds: z.array(identifier).max(200).optional() }),
  publicationReceipt: z.looseObject({ articleId: identifier }),
  media: z.looseObject({ kind: z.string(), status: z.string(), createdAt: epoch, digest: z.string().optional() }),
  mediaRevision: z.looseObject({ revision: z.number().int().positive() }),
  // The sanitized object journal precedes the claim; `mediaId` marks the claimed digest.
  mediaDigest: z.looseObject({ mediaId: identifier.optional() }),
  uploadReservation: z.looseObject({ cleanupPending: z.boolean().optional() }),
  publicationGrant: z.looseObject({ operationId: identifier, articleId: identifier, mediaId: identifier, revision: z.number().int().nonnegative(), digest: z.string() }),
};
const scopedKinds: readonly RecordKind[] = ["mediaRevision", "legacy"];

export function stableJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key]!)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
export function parsePersistenceIdentifier(value: string): string {
  return identifier.parse(value);
}
export function asBody(value: unknown): RecordBody {
  return body.parse(value);
}
export function encodeOperationIntent(value: unknown): { intent: OperationIntent; encoded: string } {
  const intent = z.object({ actorId: identifier, key: identifier, operation: identifier, input: json }).parse(value);
  const encoded = stableJson({ operation: intent.operation, input: intent.input });
  if (byteLength(encoded) > persistenceLimits.recordBytes) throw new PersistenceLimit();
  return { intent, encoded };
}
export function encodeReceiptRecord(value: unknown): { record: ReceiptRecord; encodedIntent: string; encodedResult: string } {
  const parsed = z.object({ intent: z.unknown(), result: json }).parse(value);
  const { intent, encoded: encodedIntent } = encodeOperationIntent(parsed.intent);
  const encodedResult = stableJson(parsed.result);
  if (byteLength(encodedResult) > persistenceLimits.recordBytes) throw new PersistenceLimit();
  return { record: { intent, result: parsed.result }, encodedIntent, encodedResult };
}

function withoutAbsentKeys({ namespace, sourceVersion, ...record }: z.infer<typeof input>): RecordInput {
  return { ...record, ...(namespace === undefined ? {} : { namespace }), ...(sourceVersion === undefined ? {} : { sourceVersion }) };
}

/** Validates storage shape, epoch milliseconds, scope and size; not product rules. */
export function createEditorialRecordCodec() {
  function key(kind: RecordKind, id: string, namespace = "") {
    z.enum(recordKinds).parse(kind);
    identifier.parse(id);
    if (scopedKinds.includes(kind) && !namespace) throw new TypeError("Registro exige escopo.");
    if (!scopedKinds.includes(kind) && namespace) throw new TypeError("Registro global não aceita escopo.");
    if (kind === "legacy") legacyCollection.parse(namespace);
    else if (namespace) identifier.parse(namespace);
    return { kind, id, namespace };
  }
  function parse(value: unknown): RecordInput {
    const record = input.parse(value);
    key(record.kind, record.id, record.namespace);
    shapes[record.kind]?.parse(record.body);
    if (record.kind === "mediaRevision" && String(record.body.revision) !== record.id) throw new TypeError("Revisão incoerente com o identificador.");
    for (const field of ["createdAt", "updatedAt", "publishedAt", "cleanupAt", "expiresAt"]) {
      if (record.body[field] !== undefined) epoch.parse(record.body[field]);
    }
    const encoded = stableJson({ kind: record.kind, id: record.id, body: record.body, namespace: record.namespace ?? "", sourceVersion: record.sourceVersion ?? null });
    if (byteLength(encoded) > persistenceLimits.recordBytes) throw new PersistenceLimit();
    return withoutAbsentKeys(record);
  }
  return { key, parse };
}
