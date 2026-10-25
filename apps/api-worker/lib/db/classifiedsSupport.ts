import { z } from "zod";
import type { ClassifiedsPersistence, Json, RecordQuery, StoredRecord, Transaction } from "@tudomacae/classifieds-persistence";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";

export class StoredClassifiedsDataError extends Error {
  constructor(cause: unknown) { super("Invalid persisted Classificados data.", { cause }); }
}

export function parseStored<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new StoredClassifiedsDataError(result.error);
  return result.data;
}

export function jsonValue(value: unknown): Json {
  return z.json().parse(JSON.parse(JSON.stringify(value)));
}

const profileSchema = z.object({
  id: z.string(), title: z.string(), description: z.string().default(""),
  userId: z.string().optional(), identityType: z.enum(["personal", "business"]).optional(), claimable: z.literal(true).optional(),
  source: z.object({ url: z.string(), checkedAt: z.number() }).optional(),
  contacts: z.array(z.object({ number: z.string(), isWhatsapp: z.boolean() })).default([]),
  activityAreas: z.array(z.object({ categoryId: z.string(), subcategoryId: z.string() })).default([]),
  photoPath: z.string().optional(), revision: z.number().int().positive().default(1),
  createdAt: z.number(), updatedAt: z.number().optional(),
});

export function profileData(record: StoredRecord, photoUrl?: (path: string) => string): AdvertiserProfileData {
  const value = parseStored(profileSchema, { ...record.body, id: record.id });
  return {
    ...value, updatedAt: value.updatedAt ?? value.createdAt,
    ...(value.photoPath && photoUrl ? { photoURL: photoUrl(value.photoPath) } : {}),
  };
}

/** Pages share one epoch, including the final empty page and filtered queries. */
export async function allRecords(store: Pick<ClassifiedsPersistence | Transaction, "page">, query: RecordQuery, expectedVersion?: number) {
  const items: StoredRecord[] = [];
  let version = expectedVersion;
  let after: string | undefined;
  do {
    const page = await store.page({ ...query, ...(after ? { after } : {}) }, version);
    version ??= page.version;
    items.push(...page.items);
    after = page.next;
  } while (after);
  return { items, version: version! };
}

export async function activityAreaActive(store: Pick<ClassifiedsPersistence | Transaction, "read">, area: { categoryId: string; subcategoryId: string }) {
  const parent = await store.read("category", area.categoryId);
  if (parent?.body.isActive !== true || parent.body.deleting === true) return false;
  const child = await store.read("subcategory", area.subcategoryId, area.categoryId);
  return child?.body.isActive === true && child.body.deleting !== true;
}

function decodeCursor(value: string | undefined, field: "order" | "createdAt", namespace = "") {
  if (!value) return undefined;
  try {
    const cursor = z.object({ [field]: z.number().finite(), id: z.string().min(1) }).parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return JSON.stringify([cursor[field], namespace, cursor.id]);
  }
  catch { throw new TypeError("Cursor inválido."); }
}

function encodeCursor(record: StoredRecord, field: "order" | "createdAt") {
  return Buffer.from(JSON.stringify({ [field]: record.body[field], id: record.id })).toString("base64url");
}

export async function publicPage(store: Pick<ClassifiedsPersistence, "page">, query: RecordQuery, limit: number, cursor: string | undefined, field: "order" | "createdAt") {
  let after = decodeCursor(cursor, field, query.kind === "subcategory" ? query.categoryId : undefined);
  let version: number | undefined;
  const records: StoredRecord[] = [];
  while (records.length <= limit) {
    const page = await store.page({ ...query, limit: Math.min(25, limit + 1 - records.length), ...(after ? { after } : {}) }, version);
    version ??= page.version;
    records.push(...page.items);
    if (!page.next) break;
    after = page.next;
  }
  const items = records.slice(0, limit);
  return { items, ...(records.length > limit && items.at(-1) ? { nextCursor: encodeCursor(items.at(-1)!, field) } : {}) };
}
