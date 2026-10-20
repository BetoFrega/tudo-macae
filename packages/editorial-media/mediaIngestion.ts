import {
  finalizeMediaUploadSchema,
  MediaIngestionError,
  searchMediaUploadSchema,
  validatedMediaUpload,
  type FinalizeMediaUploadInput,
  type FinalizedMediaUpload,
  type PrepareMediaUploadInput,
  type PreparedMediaUpload,
  type SearchMediaUploadInput,
} from "@tudomacae/media/ingestionPolicy";
import type { Media, MediaMetadata } from "@tudomacae/media/model";
import type { EditorialMediaCaller } from "./lib/editorialMediaCaller";
import { mediaMutationCallerDetails, mediaReadCallerDetails } from "./lib/editorialMediaCaller";

export interface EditorialMediaMutationCallerDetails {
  editorId: string;
  channel: "newsroom" | "mcp" | "administration";
  editorialClientId?: string;
}

export type EditorialMediaReadCallerDetails = EditorialMediaMutationCallerDetails;

export interface MediaIngestionIntent {
  id: string;
  ownerId: string;
  caller: EditorialMediaMutationCallerDetails;
  operation: "prepare" | "finalize";
  input: PrepareMediaUploadInput | FinalizeMediaUploadInput;
  status: "pending" | "completed" | "failed";
  createdAt: number;
  errorCode?: string;
}

export interface EditorialMediaSearchPage {
  media: Media[];
  nextCursor?: string;
}

export interface EditorialMediaIngestionDependencies {
  authorize(details: EditorialMediaMutationCallerDetails): Promise<void>;
  hasMediaUsePermission(permissionId: string): Promise<boolean>;
  begin(
    caller: EditorialMediaMutationCallerDetails,
    input: PrepareMediaUploadInput | FinalizeMediaUploadInput,
    operation: "prepare" | "finalize",
  ): Promise<{ id: string; ownerId: string }>;
  complete(id: string, targetId: string): Promise<void>;
  read(caller: EditorialMediaMutationCallerDetails, id: string): Promise<MediaIngestionIntent>;
  recordFailure(id: string, errorCode: string): Promise<void>;
  prepare(ownerId: string, operationId: string, input: PrepareMediaUploadInput): Promise<PreparedMediaUpload>;
  readFinalized(
    ownerId: string,
    operationId: string,
    input: FinalizeMediaUploadInput,
  ): Promise<FinalizedMediaUpload | null>;
  metadata(ownerId: string, reservationId: string): Promise<MediaMetadata>;
  finalize(ownerId: string, operationId: string, input: FinalizeMediaUploadInput): Promise<FinalizedMediaUpload>;
  search(input: SearchMediaUploadInput): Promise<EditorialMediaSearchPage>;
  recordSearch(caller: EditorialMediaReadCallerDetails, requestId?: string): Promise<void>;
}

export function createEditorialMediaIngestion(dependencies: EditorialMediaIngestionDependencies) {
  async function prepare(caller: EditorialMediaCaller, input: PrepareMediaUploadInput) {
    const details = mutationDetails(caller);
    await dependencies.authorize(details);
    return prepareWithDetails(details, input);
  }

  async function prepareWithDetails(details: EditorialMediaMutationCallerDetails, input: PrepareMediaUploadInput) {
    const validated = validatedMediaUpload(input);
    await assertMediaPermission(validated.metadata);
    const intent = await dependencies.begin(details, validated, "prepare");
    try {
      const prepared = await dependencies.prepare(intent.ownerId, intent.id, validated);
      await dependencies.complete(intent.id, prepared.reservationId);
      return { ...prepared, correlationId: intent.id };
    }
    catch (error) { return failIngestion(intent.id, error); }
  }

  async function finalize(caller: EditorialMediaCaller, input: FinalizeMediaUploadInput) {
    const details = mutationDetails(caller);
    await dependencies.authorize(details);
    return finalizeWithDetails(details, input);
  }

  async function finalizeWithDetails(details: EditorialMediaMutationCallerDetails, input: FinalizeMediaUploadInput) {
    const parsed = finalizeMediaUploadSchema.safeParse(input);
    if (!parsed.success) throw new MediaIngestionError("validationFailed", "Informe uma reserva e chave de finalização válidas.");
    const intent = await dependencies.begin(details, parsed.data, "finalize");
    try {
      let result = await dependencies.readFinalized(intent.ownerId, intent.id, parsed.data);
      if (!result) {
        await assertMediaPermission(await dependencies.metadata(intent.ownerId, parsed.data.reservationId));
        result = await dependencies.finalize(intent.ownerId, intent.id, parsed.data);
      }
      await dependencies.complete(intent.id, result.mediaId);
      return { ...result, correlationId: intent.id };
    }
    catch (error) { return failIngestion(intent.id, error); }
  }

  async function get(caller: EditorialMediaCaller, id: string) {
    const details = mutationDetails(caller);
    await dependencies.authorize(details);
    const intent = await dependencies.read(details, id);
    return {
      id: intent.id,
      operation: intent.operation,
      status: intent.status,
      createdAt: intent.createdAt,
      ...(intent.errorCode ? { errorCode: intent.errorCode } : {}),
    };
  }

  async function reconcile(caller: EditorialMediaCaller, id: string) {
    const details = mutationDetails(caller);
    await dependencies.authorize(details);
    const intent = await dependencies.read(details, id);
    return intent.operation === "prepare"
      ? prepareWithDetails(details, intent.input as PrepareMediaUploadInput)
      : finalizeWithDetails(details, intent.input as FinalizeMediaUploadInput);
  }

  async function search(caller: EditorialMediaCaller, input: SearchMediaUploadInput, requestId?: string) {
    const details = readDetails(caller);
    await dependencies.authorize(details);
    const parsed = searchMediaUploadSchema.safeParse(input);
    if (!parsed.success) throw new MediaIngestionError("validationFailed", "Informe filtros e paginação válidos para Mídia.");
    const page = await dependencies.search(parsed.data).catch((error: unknown) => {
      if (error instanceof TypeError) throw new MediaIngestionError("validationFailed", error.message);
      throw error;
    });
    if (details.channel === "mcp") await dependencies.recordSearch(details, requestId);
    return {
      ...page,
      media: page.media.map(({ storagePath: _storagePath, ...media }) => media),
    };
  }

  async function assertMediaPermission(metadata: MediaMetadata) {
    if (metadata.provenance.displayBasis === "permission"
      && !await dependencies.hasMediaUsePermission(metadata.provenance.permissionReference)) {
      throw new MediaIngestionError("forbidden", "A Permissão da fonte não autoriza o uso desta Mídia agora.");
    }
  }

  async function failIngestion(operationId: string, error: unknown): Promise<never> {
    const failure = error instanceof MediaIngestionError
      ? error
      : new MediaIngestionError("internalFailure", "A operação de Mídia está pendente. Tente novamente com a mesma chave.");
    await dependencies.recordFailure(operationId, failure.code);
    throw new MediaIngestionError(failure.code, failure.message, { ...failure.details, operationId });
  }

  return { prepare, finalize, get, reconcile, search };
}

function mutationDetails(caller: EditorialMediaCaller): EditorialMediaMutationCallerDetails {
  return mediaMutationCallerDetails(caller);
}

function readDetails(caller: EditorialMediaCaller): EditorialMediaReadCallerDetails {
  return mediaReadCallerDetails(caller);
}
