import { z } from "zod";
import { PersistenceConflict, type EditorialPersistence, type Json, type RecordBody, type StoredRecord, type Transaction } from "@tudomacae/editorial-persistence";
import { asBody, persistenceLimits, stableJson } from "@tudomacae/editorial-persistence/records";
import type { MediaCatalogDependencies } from "@tudomacae/media/catalog";
import { prepareMediaUploadSchema } from "@tudomacae/media/ingestionPolicy";
import type { MediaMetadataRevisionDependencies, MediaRevisionTransaction } from "@tudomacae/media/metadataRevision";
import { mediaMetadataSchema, type Media, type MediaRevision } from "@tudomacae/media/model";
import { sanitizedMediaPath } from "@tudomacae/media/sanitizedContent";
import type { MediaSearchDependencies } from "@tudomacae/media/search";
import { mediaDocumentSchema } from "@tudomacae/media/transitionPolicy";
import type { MediaUploadQueryDependencies } from "@tudomacae/media/uploadQueries";
import type { MediaUploadReservation } from "@tudomacae/media/uploadReservation";

type PageQuery = Parameters<EditorialPersistence["page"]>[0];

/** Drops `undefined` fields, which the record codec rejects, from a domain value. */
export function recordBody(value: object): RecordBody {
  return asBody(JSON.parse(JSON.stringify(value)));
}
/** A persisted editorial row that no longer matches its schema: a server failure, never the caller's input. */
export class StoredMediaDataError extends Error {
  constructor(cause: unknown) { super("Invalid persisted Media data.", { cause }); }
}

export function parseStoredMedia<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new StoredMediaDataError(result.error);
  return result.data;
}

export function toMedia(record: StoredRecord): Media {
  return { id: record.id, ...parseStoredMedia(mediaDocumentSchema, record.body) } as Media;
}
export function mediaRecord(media: Media) {
  const { id, ...body } = media;
  return { kind: "media" as const, id, body: recordBody(body) };
}
const revisionSchema = z.object({ mediaId: z.string(), revision: z.number().int().positive(), metadata: mediaMetadataSchema, replacedAt: z.number(), replacedBy: z.string() });
const finalizedResultSchema = z.object({ status: z.enum(["created", "duplicate", "conflict"]), mediaId: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) });
// The owner is the digest `mediaOwnerId` derives; any other value would turn corruption into a 403.
const reservationFields = { id: z.string(), ownerId: z.string().regex(/^[a-f0-9]{64}$/), input: prepareMediaUploadSchema, createdAt: z.number(), expiresAt: z.number(), cleanupAt: z.number(), cleanupPending: z.boolean() };
// The whole reservation per status: a finalized reservation without its finalization and result, or any reservation in an
// unknown status, is corruption that finalization would otherwise return as a result or retry.
const reservationSchema = z.discriminatedUnion("status", [
  z.looseObject({ ...reservationFields, status: z.literal("prepared"), finalizationId: z.never().optional(), result: z.never().optional() }),
  z.looseObject({ ...reservationFields, status: z.literal("finalizing"), finalizationId: z.string().min(1), result: z.never().optional() }),
  z.looseObject({ ...reservationFields, status: z.literal("finalized"), finalizationId: z.string().min(1), result: finalizedResultSchema }),
  z.looseObject({ ...reservationFields, status: z.literal("expired"), finalizationId: z.string().min(1).optional(), result: z.never().optional() }),
]);
export function toReservation(record: StoredRecord): MediaUploadReservation {
  return parseStoredMedia(reservationSchema.refine(value => value.id === record.id), record.body) as unknown as MediaUploadReservation;
}

/** Whether Media holds the sanitized asset of `digest`, whatever its lifecycle status. */
export function holdsSanitizedAsset(media: Media, digest: string) {
  return sanitizedMediaPath({ ...media, status: "staged" }, digest) !== null;
}

/** A finalized result is replayed as is, so it must name Media that holds the digest it reports. */
export async function readReservation(read: (kind: "uploadReservation" | "media", id: string) => Promise<StoredRecord | null>, id: string) {
  const record = await read("uploadReservation", id);
  if (!record) return null;
  const reservation = toReservation(record);
  if (!reservation.result) return reservation;
  const media = await read("media", reservation.result.mediaId);
  if (!media || !holdsSanitizedAsset(toMedia(media), reservation.result.digest)) throw new StoredMediaDataError(new Error(`A reserva ${id} nomeia uma Mídia sem o digest finalizado.`));
  return reservation;
}

/** Decisions run inside a retried D1 attempt; the domain result needs no receipt, so it never becomes JSON. */
export async function transactMedia<T>(persistence: EditorialPersistence, decide: (tx: Transaction) => Promise<T>): Promise<T> {
  return (await persistence.transact(null, async tx => await decide(tx) as Json)).value as T;
}

/** Reads every page of one query against the version of its first page, restarting when a write lands mid-scan. */
export async function readPages(store: Pick<EditorialPersistence, "page">, query: PageQuery, limit = Number.POSITIVE_INFINITY) {
  for (let attempt = 0; attempt < persistenceLimits.attempts; attempt++) {
    try {
      const items: StoredRecord[] = [];
      let version: number | undefined;
      let after = query.after;
      do {
        const page = await store.page({ ...query, ...(after ? { after } : {}), limit: Math.min(persistenceLimits.pageItems, limit - items.length) }, version);
        version ??= page.version;
        items.push(...page.items);
        after = page.next;
      } while (after && items.length < limit);
      return items;
    }
    catch (error) {
      if (!(error instanceof PersistenceConflict)) throw error;
    }
  }
  throw new PersistenceConflict();
}

/** Reads the archive slot of the current revision with the Media, so `archive` can stay synchronous. */
export function mediaRevisionTransaction(tx: Transaction): MediaRevisionTransaction {
  const current = new Map<string, Media>();
  return {
    async read(id) {
      const record = await tx.read("media", id);
      if (!record) return null;
      const media = toMedia(record);
      if (await tx.read("mediaRevision", String(media.revision), id)) throw new Error(`A revisão ${media.revision} da Mídia ${id} já foi arquivada.`);
      current.set(id, media);
      return media;
    },
    archive(revision) {
      tx.put({ kind: "mediaRevision", namespace: revision.mediaId, id: String(revision.revision), body: recordBody(revision) });
    },
    update(id, patch) {
      const media = current.get(id);
      if (!media) throw new TypeError("Atualização exige leitura da Mídia.");
      tx.put(mediaRecord({ ...media, ...patch.metadata, revision: patch.revision, updatedAt: patch.updatedAt }));
    },
  };
}

export function createMediaRevisionStore(persistence: EditorialPersistence): MediaMetadataRevisionDependencies["store"] {
  return { transact: decide => transactMedia(persistence, tx => decide(mediaRevisionTransaction(tx))) };
}

export function createMediaCatalogStore(persistence: EditorialPersistence, newId: () => string): MediaCatalogDependencies["store"] {
  return {
    create: record => transactMedia(persistence, async (tx) => {
      const id = newId();
      if (await tx.read("media", id)) throw new PersistenceConflict();
      tx.put(mediaRecord({ id, ...record } as Media));
      return id;
    }),
    ensure: (id, record) => transactMedia(persistence, async (tx) => {
      const existing = await tx.read("media", id);
      if (!existing) {
        tx.put(mediaRecord({ id, ...record } as Media));
        return id;
      }
      const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...stable } = existing.body;
      const { revision: _expected, createdAt: _expectedCreated, updatedAt: _expectedUpdated, ...expected } = recordBody(record);
      if (stableJson(stable) !== stableJson(expected)) throw new Error(`A Mídia ${id} diverge do registro canônico esperado.`);
      return id;
    }),
    read: async (id) => {
      const record = await persistence.read("media", id);
      return record ? toMedia(record) : null;
    },
    // A revision stored under another Media's namespace or slot would join the wrong history.
    revisions: async mediaId => (await readPages(persistence, { kind: "mediaRevision", namespace: mediaId, order: "revision" }))
      .map(record => parseStoredMedia(revisionSchema.refine(value => value.mediaId === mediaId && String(value.revision) === record.id), record.body) as MediaRevision),
    // D1 receives only canonical Media: the transfer requires the source transition to finish first.
    transition: async () => {
      throw new Error("A transição de Mídias legadas acontece na fonte, antes da transferência.");
    },
  };
}

/** Newest first with the identifier as tiebreak, matching the search cursor of `@tudomacae/media/search`. */
export function createMediaScan(persistence: EditorialPersistence): MediaSearchDependencies["scan"] {
  return async ({ limit, kind, status, cursor }) => (await readPages(persistence, {
    kind: "media", order: "createdDesc",
    ...(kind ? { mediaKind: kind } : {}), ...(status ? { status } : {}),
    ...(cursor ? { after: JSON.stringify([cursor.createdAt, "", cursor.id]) } : {}),
  }, limit)).map(toMedia);
}

export function createMediaUploadQueryReader(persistence: EditorialPersistence): MediaUploadQueryDependencies["read"] {
  return async (id) => {
    const reservation = await readReservation((kind, key) => persistence.read(kind, key), id);
    if (!reservation) return null;
    return { ownerId: reservation.ownerId, metadata: reservation.input.metadata, finalizationId: reservation.finalizationId, result: reservation.result };
  };
}
