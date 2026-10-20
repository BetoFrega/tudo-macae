import { createHash } from "node:crypto";
import { z } from "zod";
import type { EditorialPersistence, StoredRecord, Transaction } from "@tudomacae/editorial-persistence";
import { stableJson } from "@tudomacae/editorial-persistence/records";
import { editorialActivityExpiresAt, type EditorialActivity, type EditorialActivityOperation } from "@tudomacae/editorial-access/activity";
import { mediaOwnerId } from "@tudomacae/editorial-media/owner";
import type { MediaCorrectionDependencies, MediaCorrectionReceipt } from "@tudomacae/editorial-media/mediaCorrection";
import type { EditorialMediaIngestionDependencies, MediaIngestionIntent } from "@tudomacae/editorial-media/mediaIngestion";
import { createMediaMetadataRevision } from "@tudomacae/media/metadataRevision";
import { finalizeMediaUploadSchema, MediaIngestionError, prepareMediaUploadSchema } from "@tudomacae/media/ingestionPolicy";
import { mediaRevisionTransaction, parseStoredMedia, recordBody, StoredMediaDataError, toMedia, transactMedia } from "./editorialMedia";

type ActivityCaller = Pick<EditorialActivity, "editorId" | "channel"> & Partial<Pick<EditorialActivity, "administratorId" | "editorialClientId" | "editorialDelegationId">>;
type IntentStore = Pick<EditorialMediaIngestionDependencies, "begin" | "complete" | "read" | "recordFailure" | "recordSearch">;

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** The activity id must already be read in `tx`; a correlation id names one activity only. */
function putActivity(tx: Transaction, id: string, caller: ActivityCaller, operation: EditorialActivityOperation, targetId: string, at: number, reason?: string) {
  const activity: EditorialActivity = {
    editorId: caller.editorId,
    ...(caller.administratorId ? { administratorId: caller.administratorId } : {}),
    channel: caller.channel, operation, targetId, result: "completed", correlationId: id,
    createdAt: at, expiresAt: editorialActivityExpiresAt(at),
    ...(caller.editorialClientId ? { editorialClientId: caller.editorialClientId } : {}),
    ...(caller.editorialDelegationId ? { editorialDelegationId: caller.editorialDelegationId } : {}),
    ...(reason ? { reason } : {}),
  };
  tx.put({ kind: "activity", id, body: recordBody(activity) });
}

async function readFreshActivity(tx: Transaction, id: string) {
  if (await tx.read("activity", id)) throw new Error(`A atividade editorial ${id} já foi registrada.`);
}

// A replayed receipt answers the caller, so its canonical Media must parse like any stored Media.
// It must also name the Media being corrected, or a replay would answer with another Media.
const receiptSchema = z.looseObject({ operation: z.literal("media.correctionApplied"), fingerprint: z.string().min(1), correlationId: z.string().min(1), targetId: z.string().min(1), media: z.looseObject({ id: z.string().min(1) }) });
function toReceipt(body: unknown, mediaId: string): MediaCorrectionReceipt {
  const receipt = parseStoredMedia(receiptSchema.refine(value => value.targetId === mediaId && value.media.id === mediaId), body);
  const { id, ...media } = receipt.media;
  return { ...receipt, media: toMedia({ id, body: media } as StoredRecord) };
}

/** Correction receipts share the editorial idempotency key space, as in the source. */
export function createMediaCorrectionTransact(persistence: EditorialPersistence, dependencies: { now(): number; newId(): string }): MediaCorrectionDependencies["transact"] {
  const revisions = createMediaMetadataRevision({ now: dependencies.now, store: { transact: () => Promise.reject(new Error("A correção revisa dentro da própria transação.")) } });
  return (caller, input, decide) => transactMedia(persistence, async (tx) => {
    const media = mediaRevisionTransaction(tx);
    const activityId = dependencies.newId();
    await readFreshActivity(tx, activityId);
    return decide({
      async read() {
        const current = await media.read(input.mediaId);
        const receipt = input.idempotencyKey ? await tx.read("idempotency", input.idempotencyKey) : null;
        return { media: current, ...(receipt ? { previous: toReceipt(receipt.body, input.mediaId) } : {}) };
      },
      revise: correction => revisions.coordinate(media, correction),
      saveIdempotency(receipt) {
        if (!input.idempotencyKey) return;
        tx.put({ kind: "idempotency", id: input.idempotencyKey, body: recordBody({ ...receipt, targetId: input.mediaId, editorId: caller.editorId }) });
      },
      recordActivity(operation, targetId, at, reason) {
        putActivity(tx, activityId, caller, operation, targetId, at, reason);
        return activityId;
      },
    });
  });
}

// The caller per channel: an administrative intent without its administrator would record activity nobody is accountable for.
// Fields of another channel are refused too, because activity copies every accountability field the caller carries.
const absent = z.never().optional();
const callerSchema = z.discriminatedUnion("channel", [
  z.looseObject({ channel: z.literal("newsroom"), editorId: z.string().min(1), administratorId: absent, editorialClientId: absent, editorialDelegationId: absent }),
  z.looseObject({ channel: z.literal("mcp"), editorId: z.string().min(1), editorialClientId: z.string().min(1), editorialDelegationId: z.string().min(1).optional(), administratorId: absent }),
  z.looseObject({ channel: z.literal("administration"), editorId: z.string().min(1), administratorId: z.string().min(1), editorialClientId: absent, editorialDelegationId: absent }),
]);
// The whole persisted intent: a row missing its caller, input or timestamp is corruption, not a caller error.
const intentFields = { id: z.string(), ownerId: z.string(), status: z.enum(["pending", "completed", "failed"]), caller: callerSchema, createdAt: z.number(), errorCode: z.string().optional(), targetId: z.string().min(1).optional() };
const intentSchema = z.discriminatedUnion("operation", [
  z.looseObject({ ...intentFields, operation: z.literal("prepare"), input: prepareMediaUploadSchema }),
  z.looseObject({ ...intentFields, operation: z.literal("finalize"), input: finalizeMediaUploadSchema }),
]);

export function createMediaIngestionIntents(persistence: EditorialPersistence, now: () => number): IntentStore {
  // An intent stored under another key, or naming a caller its owner does not derive from, would attribute activity to someone else.
  const intent = (id: string, body: unknown) => parseStoredMedia(intentSchema.refine(value => value.id === id && mediaOwnerId(value.caller) === value.ownerId && (value.status !== "completed" || !!value.targetId)), body) as unknown as MediaIngestionIntent;
  return {
    async begin(caller, input, operation) {
      const ownerId = mediaOwnerId(caller);
      const id = sha256([ownerId, operation, input.idempotencyKey]);
      await transactMedia(persistence, async (tx) => {
        const existing = await tx.read("ingestionIntent", id);
        if (!existing) {
          tx.put({ kind: "ingestionIntent", id, body: recordBody({ id, ownerId, caller, input, operation, status: "pending", createdAt: now() }) });
          return;
        }
        const stored = intent(id, existing.body);
        if (stored.ownerId !== ownerId || stored.operation !== operation) throw new StoredMediaDataError(new Error(`A operação de Mídia ${id} pertence a outro chamador.`));
        if (stableJson(recordBody({ input }).input!) !== stableJson(existing.body.input!)) {
          throw new MediaIngestionError("duplicate", "A chave já identifica outra operação editorial.");
        }
        if (existing.body.status === "failed") tx.put({ kind: "ingestionIntent", id, body: { ...existing.body, status: "pending" } });
      });
      return { id, ownerId };
    },
    recordFailure: (id, errorCode) => transactMedia(persistence, async (tx) => {
      const current = await tx.read("ingestionIntent", id);
      if (!current || current.body.status === "completed") return;
      tx.put({ kind: "ingestionIntent", id, body: { ...current.body, status: errorCode === "internalFailure" ? "pending" : "failed", errorCode } });
    }),
    async read(caller, id) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new MediaIngestionError("validationFailed", "Informe uma operação de Mídia válida.");
      const record = await persistence.read("ingestionIntent", id);
      if (!record) throw new MediaIngestionError("notFound", "A operação de Mídia não existe.");
      const value = intent(id, record.body);
      if (value.ownerId !== mediaOwnerId(caller)) throw new MediaIngestionError("forbidden", "A operação pertence a outro chamador.");
      return value;
    },
    async recordSearch(caller, requestId) {
      if (!requestId) throw new MediaIngestionError("validationFailed", "A consulta MCP exige correlação.");
      await transactMedia(persistence, async (tx) => {
        await readFreshActivity(tx, requestId);
        putActivity(tx, requestId, caller, "media.searchRead", "media", now());
      });
    },
    complete: (id, targetId) => transactMedia(persistence, async (tx) => {
      const current = await tx.read("ingestionIntent", id);
      if (!current) throw new MediaIngestionError("notFound", "A operação de Mídia não existe.");
      const value = intent(id, current.body);
      if (value.status === "completed") {
        // A completed intent's activity names its target, so a replay reaching another target is corruption, not success.
        if (current.body.targetId !== targetId) throw new StoredMediaDataError(new Error(`A operação de Mídia ${id} concluiu para outro alvo.`));
        return;
      }
      await readFreshActivity(tx, id);
      putActivity(tx, id, value.caller, value.operation === "prepare" ? "media.uploadPrepared" : "media.uploadFinalized", targetId, now());
      const { errorCode: _errorCode, ...body } = current.body;
      tx.put({ kind: "ingestionIntent", id, body: { ...body, status: "completed", targetId, completedAt: now() } });
    }),
  };
}
