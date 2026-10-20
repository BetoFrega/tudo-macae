import { z } from "zod";
import { normalizeBusinessName } from "@tudomacae/advertiser-identity/business";
import { ownsRawAdImagePath } from "@tudomacae/ads/rawImagePath";
import { PersistenceLimit, recordKinds, type Json, type RecordInput, type RecordBody, type OperationIntent, type ReceiptRecord } from "./index";

export const persistenceLimits = {
  recordBytes: 1_000_000,
  pageBytes: 1_024_000,
  pageItems: 25,
  commands: 16,
  guards: 32,
  statements: 96,
  attempts: 4,
} as const;
const identifier = z.string().min(1).max(2048).refine(value => byteLength(value) <= 4096, "Identificador excede o envelope técnico.");
const epoch = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const json: z.ZodType<Json> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(z.string(), json),
]));
const body = z.record(z.string(), json);
const input = z.object({ kind: z.enum(recordKinds), id: identifier, body, sourceVersion: identifier.optional(), namespace: identifier.optional() });
const contact = z.object({ number: z.string(), isWhatsapp: z.boolean() });
const area = z.object({ categoryId: identifier, subcategoryId: identifier });
const provenance = z.object({ url: z.url(), checkedAt: epoch });
const profile = z.looseObject({
  title: z.string(), description: z.string().optional(), userId: identifier.optional(),
  identityType: z.enum(["personal", "business"]).optional(), claimable: z.literal(true).optional(), source: provenance.optional(),
  contacts: z.array(contact).optional(), activityAreas: z.array(area).optional(),
  pendingImageUploadReservations: z.array(z.object({ path: z.string(), expiresAt: epoch.optional() })).optional(),
  photoPath: z.string().optional(), revision: revision.optional(), createdAt: epoch, updatedAt: epoch.optional(),
});
const category = z.looseObject({ name: z.string(), slug: identifier, order: z.number().finite(), isActive: z.boolean(), deleting: z.boolean().optional() });
const image = z.looseObject({ path: z.string(), pending: z.boolean().optional() });
const ad = z.looseObject({
  title: z.string().optional(), userId: identifier, advertiserProfileId: z.string().optional(),
  categoryId: z.string().optional(), subcategoryId: z.string().optional(), status: z.string(),
  createdAt: epoch, updatedAt: epoch.optional(), images: z.array(image).optional(),
  pendingImageCleanupPaths: z.array(z.string()).optional(), pendingImageCleanupClaims: z.array(z.string()).optional(),
  pendingImageUploadReservations: z.array(z.object({ path: z.string(), expiresAt: epoch.optional() })).optional(),
});
const catalog = z.looseObject({ enabled: z.boolean().default(false), revision: epoch, items: z.array(z.looseObject({
  id: identifier, name: z.string(), description: z.string(), visible: z.boolean(),
  source: provenance.optional(),
  price: z.union([z.object({ mode: z.enum(["fixed", "from"]), cents: epoch }), z.object({ mode: z.literal("on_request") })]),
})).max(100) });

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
  if (byteLength(encodedResult) > persistenceLimits.recordBytes
    || byteLength(encodedIntent) + byteLength(encodedResult) + byteLength(intent.actorId) + byteLength(intent.key) > 1_800_000) throw new PersistenceLimit();
  return { record: { intent, result: parsed.result }, encodedIntent, encodedResult };
}

type ParsedRecord = z.infer<typeof input>;
function scopeSubcategory(record: ParsedRecord) {
  if (record.kind !== "subcategory") return;
  const subcategory = category.extend({ categoryId: identifier }).parse(record.body);
  if (record.namespace !== undefined && record.namespace !== subcategory.categoryId) throw new TypeError("Escopo de subcategoria incoerente.");
  record.namespace = subcategory.categoryId;
}
function validateKindBody(record: ParsedRecord) {
  if (record.kind === "profile") {
    profile.parse(record.body);
    record.body.revision ??= 1;
  }
  if (record.kind === "ad") {
    ad.parse(record.body);
    if (record.id.includes("/")) throw new TypeError("Identificador de anúncio inválido.");
  }
  if (record.kind === "catalog") catalog.parse(record.body);
  if (record.kind === "audit") z.object({ at: epoch.optional() }).parse(record.body);
}
function validateTimestamps(value: RecordBody) {
  for (const key of ["createdAt", "updatedAt", "dueAt", "expiresAt"]) {
    if (value[key] !== undefined) epoch.parse(value[key]);
  }
}
function assertWithinRecordLimit(record: ParsedRecord) {
  if (byteLength(stableJson({ kind: record.kind, id: record.id, body: record.body, namespace: record.namespace ?? "", sourceVersion: record.sourceVersion ?? null })) > persistenceLimits.recordBytes) throw new PersistenceLimit();
}

/** Storage validation preserves legacy fields; domain factories own product limits. */
export function createClassifiedsRecordCodec() {
  function key(kind: RecordInput["kind"], id: string, namespace = "") {
    z.enum(recordKinds).parse(kind);
    identifier.parse(id);
    if (namespace) identifier.parse(namespace);
    if (["category", "profile", "ad", "catalog"].includes(kind) && namespace) throw new TypeError("Registro global não aceita escopo.");
    if (kind === "subcategory" && !namespace) throw new TypeError("Subcategoria exige Categoria.");
    return { kind, id, namespace };
  }
  function parse(value: unknown): RecordInput {
    const record = input.parse(value);
    if (record.kind === "category") category.parse(record.body);
    scopeSubcategory(record);
    key(record.kind, record.id, record.namespace);
    validateKindBody(record);
    validateTimestamps(record.body);
    assertWithinRecordLimit(record);
    return { kind: record.kind, id: record.id, body: record.body,
      ...(record.sourceVersion === undefined ? {} : { sourceVersion: record.sourceVersion }),
      ...(record.namespace ? { namespace: record.namespace } : {}),
    };
  }
  function indexes(record: RecordInput) {
    const value = record.body;
    const title = record.kind === "profile" ? normalizeBusinessName(String(value.title ?? "")) : null;
    const contacts = record.kind === "profile" && Array.isArray(value.contacts)
      ? value.contacts.map(item => contact.parse(item).number.replace(/\D/g, ""))
      : [];
    return { title, contacts: [...new Set(contacts.filter(Boolean))] };
  }
  return { key, parse, indexes };
}

type ArtifactPath = { path: string; linked: number; pending: number; completed: number; expiresAt: number | null; reserved: number };
type UploadReservation = { path: string; expiresAt?: number | undefined };
// Missing expiry is intentionally blocking, including duplicate historical entries.
function reservedUntil(item: ArtifactPath, reservation: UploadReservation) {
  if (item.reserved === 0) return reservation.expiresAt ?? null;
  return item.expiresAt === null || reservation.expiresAt === undefined ? null : Math.max(item.expiresAt, reservation.expiresAt);
}
function artifactPaths(value: z.infer<typeof ad>): ArtifactPath[] {
  const paths = new Map<string, ArtifactPath>();
  function path(value: string) {
    let item = paths.get(value);
    if (!item) {
      item = { path: value, linked: 0, pending: 0, completed: 0, expiresAt: null, reserved: 0 };
      paths.set(value, item);
    }
    return item;
  }
  for (const image of value.images ?? []) {
    const item = path(image.path);
    item.linked = 1;
    if (image.pending === true) item.pending = 1;
    else item.completed = 1;
  }
  for (const cleanupPath of [...value.pendingImageCleanupPaths ?? [], ...value.pendingImageCleanupClaims ?? []]) path(cleanupPath).pending = 1;
  for (const reservation of value.pendingImageUploadReservations ?? []) {
    const item = path(reservation.path);
    item.expiresAt = reservedUntil(item, reservation);
    item.reserved = 1;
  }
  return [...paths.values()];
}

export function createClassifiedsArtifactIndex(dependencies: {
  ownsImagePath(adId: string, path: string): boolean;
  cleanupJobId(path: string): string;
}) {
  function artifacts(record: RecordInput) {
    if (record.kind !== "ad") return [];
    return artifactPaths(ad.parse(record.body)).map(item => ({
      ...item, ownership: artifactOwnership(record.id, item.path),
      jobId: dependencies.cleanupJobId(item.path),
    }));
  }
  function artifactOwnership(adId: string, path: string) {
    if (dependencies.ownsImagePath(adId, path)) return "owned";
    return ownsRawAdImagePath(adId, path) ? "legacy" : "foreign";
  }
  function encode(record: RecordInput): string {
    const encoded = JSON.stringify(artifacts(record));
    if (byteLength(encoded) > persistenceLimits.recordBytes) throw new PersistenceLimit();
    return encoded;
  }
  return { artifacts, encode };
}
export function asBody(value: unknown): RecordBody {
  return body.parse(value);
}
