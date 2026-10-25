import { PhotoError, PhotoObjectUnavailable, type PhotoObjectJournal, type ReservedObjectRecord } from "@tudomacae/classifieds-photos";
import type { EditorialPersistence, RecordKind } from "@tudomacae/editorial-persistence";
import { createStaticMediaFileInspection, mediaFrameCount, staticMediaContentTypeFromSignature } from "@tudomacae/media/fileInspection";
import { MediaIngestionError, mediaUploadContentTypes, mediaUploadLimits } from "@tudomacae/media/ingestionPolicy";
import type { MediaUploadReservation } from "@tudomacae/media/uploadReservation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { parseStoredMedia, recordBody, StoredMediaDataError, toReservation, transactMedia } from "../db/editorialMedia";
import type { MediaBytes } from "../editorialMedia";
import { byteStream } from "./classifiedsPhotoDecoder";
import { createHostedPhotoObjects } from "./hostedPhotos";

type HostedInput = Parameters<typeof createHostedPhotoObjects>[0];
type MediaImages = Pick<ImagesBinding, "info" | "input">;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const invalidImage = () => new MediaIngestionError("validationFailed", "Imagem inválida, animada ou acima dos limites de bytes e pixels. Envie uma imagem estática de até 1 MiB.");

const journalSchema = z.object({
  operationId: z.string(), digest: z.string(), size: z.number().int().positive(), mimeType: z.enum(mediaUploadContentTypes), status: z.enum(["pending", "retiring", "retired"]),
  id: z.string().min(1).optional(), uploadURL: z.url().optional(), expiresAt: z.number().optional(),
  claimToken: z.uuid().optional(), claimUntil: z.number().optional(),
});
type JournalEntry = z.infer<typeof journalSchema>;

/**
 * Keeps the Hosted reservation of one object inside `field` of an editorial record, so the object and the record that
 * names it change in the same D1. The entry also holds the object's size and type, which readers need to rebuild its record.
 */
function fieldJournal(persistence: EditorialPersistence, kind: RecordKind, field: string, required: boolean): PhotoObjectJournal<ReservedObjectRecord> & { entry(id: string): Promise<JournalEntry | null> } {
  function parse(value: unknown, record: ReservedObjectRecord) {
    const entry = journalSchema.safeParse(value);
    if (!entry.success) throw new PhotoObjectUnavailable("journal", record.operationId);
    if (entry.data.operationId !== record.operationId || entry.data.digest !== record.digest) throw new PhotoError("conflict", "A reserva já identifica outro arquivo.");
    return entry.data;
  }
  // A journal naming another record's operation would rebuild that record's object under this one.
  async function entry(id: string) {
    const value = (await persistence.read(kind, id))?.body[field];
    return value ? parseStoredMedia(journalSchema.refine(journal => journal.operationId === id), value) : null;
  }
  return {
    entry,
    async read(record) {
      const value = (await persistence.read(kind, record.operationId))?.body[field];
      return value ? parse(value, record) : null;
    },
    change: (record, decide) => transactMedia(persistence, async (tx) => {
      const stored = await tx.read(kind, record.operationId);
      if (!stored && required) throw new PhotoObjectUnavailable("journal", record.operationId);
      const prior = stored?.body[field];
      const next = decide(prior ? parse(prior, record) : null);
      tx.put({ kind, id: record.operationId, body: recordBody({ ...stored?.body, [field]: { ...next, size: record.size, mimeType: record.mimeType } }) });
      return next;
    }),
  };
}

const recordOf = (entry: JournalEntry): ReservedObjectRecord => ({ operationId: entry.operationId, digest: entry.digest, size: entry.size, mimeType: entry.mimeType });

const storageUnavailable = () => new MediaIngestionError("internalFailure", "O armazenamento de imagens está indisponível. Tente novamente.");
/** A refused upload tells the editor why; provider and journal failures are retryable. */
function uploadFailure(error: unknown) {
  if (error instanceof PhotoObjectUnavailable || !(error instanceof PhotoError)) return storageUnavailable();
  // `uploadConflict` lets the upload route answer 409, which a retrying client treats as already uploaded.
  return error.code === "conflict"
    ? new MediaIngestionError("validationFailed", "A reserva já recebeu outro arquivo ou um envio está em andamento.", { uploadConflict: true })
    : new MediaIngestionError("validationFailed", "O arquivo divergiu da reserva ou o envio expirou.");
}

async function readOutput(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.byteLength;
      if (size > mediaUploadLimits.maxBytes) throw invalidImage();
      chunks.push(part.value);
    }
  }
  finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const decodeFailureCodes = [9412, 9413];
/** The Images binding refuses malformed bytes with these codes; any other failure is the binding's. */
function sanitizeFailure(error: unknown) {
  if (error instanceof MediaIngestionError) return error;
  if (error instanceof TypeError || (typeof error === "object" && error && "code" in error && decodeFailureCodes.includes(Number(error.code)))) return invalidImage();
  return new MediaIngestionError("internalFailure", "O processamento de imagens está indisponível. Tente novamente.");
}

/**
 * Applies the shared admission policy before transforming: frames come from the container, dimensions from the
 * binding, and only a single static frame is re-encoded as WebP, so metadata and trailing bytes never leave quarantine.
 */
function createHostedMediaSanitizer(images: MediaImages): MediaBytes["sanitize"] {
  const inspection = createStaticMediaFileInspection({ async decode(bytes) {
    const info = await images.info(byteStream(bytes));
    const contentType = mediaUploadContentTypes.find(type => type === info.format);
    if (!contentType || !("width" in info)) throw new TypeError("unsupported image");
    return { contentType, width: info.width, height: info.height, pages: mediaFrameCount(bytes) };
  } });
  return async (bytes) => {
    try {
      await inspection.inspect(bytes);
      const output = await images.input(byteStream(bytes)).transform({}).output({ format: "image/webp", quality: 85, anim: false });
      if (output.contentType() !== "image/webp") throw invalidImage();
      const sanitized = await readOutput(output.image());
      if (!sanitized.byteLength) throw invalidImage();
      return { bytes: sanitized, digest: sha256(sanitized) };
    }
    catch (error) {
      throw sanitizeFailure(error);
    }
  };
}

/**
 * Quarantined uploads and sanitized Media as Hosted Images that always require signed URLs. The quarantine entry lives in
 * the upload reservation and the sanitized entry in the digest record, which a finalization later claims for its Media.
 */
export function createHostedMediaBytes(input: HostedInput & {
  persistence: EditorialPersistence; processing: MediaImages;
  /** Signs the Worker URL that receives the editor's PUT; it must bind the reservation and its exact size. */
  signUpload(reservation: MediaUploadReservation): Promise<{ url: string; headers: Record<string, string> }>;
}) {
  const { persistence } = input;
  const uploads = fieldJournal(persistence, "uploadReservation", "upload", true);
  const sanitized = fieldJournal(persistence, "mediaDigest", "object", false);
  const hosted = { ...input, releaseEvent: "media.hosted_image_release" };
  const quarantine = createHostedPhotoObjects(hosted, uploads);
  const media = createHostedPhotoObjects(hosted, sanitized);
  const bytes: MediaBytes & {
    storeUpload(reservationId: string, bytes: Uint8Array): Promise<void>;
    readMedia(digest: string): Promise<Uint8Array | null>;
  } = {
    // Hosted objects are created with `requireSignedURLs`; there is no public bucket setting to verify.
    assertPrivate: async () => {},
    async sign(reservation) {
      const upload = await input.signUpload(reservation);
      return { reservationId: reservation.id, expiresAt: reservation.expiresAt, upload: { ...upload, method: "PUT" } };
    },
    async storeUpload(reservationId, content) {
      const record = await persistence.read("uploadReservation", reservationId);
      if (!record) throw new MediaIngestionError("notFound", "A reserva de envio não existe.");
      const reservation = toReservation(record);
      if (reservation.status !== "prepared" || reservation.expiresAt <= input.now()) {
        throw new MediaIngestionError("validationFailed", "A reserva de envio expirou. Prepare um novo envio.", { reservationExpired: true });
      }
      if (content.byteLength !== reservation.input.size) throw new MediaIngestionError("validationFailed", "O arquivo divergiu do tamanho reservado.");
      if (staticMediaContentTypeFromSignature(content) !== reservation.input.contentType) throw new MediaIngestionError("validationFailed", "O tipo do arquivo divergiu do reservado.");
      const digest = sha256(content);
      // Bytes other than those received are refused, never answered 409, which clients read as already uploaded.
      const refuseOtherBytes = async () => {
        const received = await uploads.entry(reservationId);
        if (received && received.digest !== digest) throw new MediaIngestionError("validationFailed", "A reserva já recebeu outro arquivo.");
      };
      await refuseOtherBytes();
      try {
        await quarantine.create({ operationId: reservationId, digest, size: content.byteLength, mimeType: reservation.input.contentType }, content);
      }
      catch (error) {
        // A concurrent upload of other bytes can journal its digest after the check above.
        await refuseOtherBytes();
        throw uploadFailure(error);
      }
    },
    async readUpload(reservation) {
      const entry = await uploads.entry(reservation.id);
      const content = entry && await quarantine.read(recordOf(entry)).catch((error: unknown) => {
        throw uploadFailure(error);
      });
      if (!content) throw new MediaIngestionError("validationFailed", "O arquivo ainda não foi enviado para esta reserva.");
      return content.bytes;
    },
    sanitize: createHostedMediaSanitizer(input.processing),
    async storeMedia(content, digest) {
      try {
        await media.create({ operationId: digest, digest, size: content.byteLength, mimeType: "image/webp" }, content);
      }
      catch {
        // Sanitized bytes always match their record, so a refusal here is a concurrent claim or the provider: both retryable.
        throw storageUnavailable();
      }
      return `media-staged/sha256-${digest}.webp`;
    },
    async removeUpload(reservationId) {
      const entry = await uploads.entry(reservationId);
      if (entry) await quarantine.retire(recordOf(entry));
    },
    async readMedia(digest) {
      const entry = await sanitized.entry(digest);
      if (!entry) return null;
      // Hosted verification checks the journal's digest, so a journal naming another digest would serve other bytes.
      if (entry.digest !== digest) throw new StoredMediaDataError(new Error(`O registro do digest ${digest} nomeia outro arquivo.`));
      return (await media.read(recordOf(entry)))?.bytes ?? null;
    },
  };
  return bytes;
}
