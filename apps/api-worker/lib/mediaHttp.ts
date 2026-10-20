import { TRPCError } from "@trpc/server";
import { firstPartyEditorialCaller } from "@tudomacae/editorial-access/caller";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { administrativeMediaCaller } from "@tudomacae/editorial-media/caller";
import { mediaOwnerId } from "@tudomacae/editorial-media/owner";
import { editorialAuthorityPath, mediaErrorSchema, type MediaErrorShape, type MediaReadOperation, type MediaWriteOperation } from "@tudomacae/editorial-media/protocol";
import { MediaNotFoundError, MediaRevisionConflictError } from "@tudomacae/media/errors";
import { MediaIngestionError, mediaUploadLimits } from "@tudomacae/media/ingestionPolicy";
import { sanitizedMediaPath } from "@tudomacae/media/sanitizedContent";
import { z } from "zod";
import type { EditorialAuthority } from "./db/editorialAuthority";
import { StoredMediaDataError, toReservation } from "./db/editorialMedia";
import { createLegacySourcePermissions } from "./db/editorialSourcePermissions";
import { readIdentityAccount } from "./db/identityAccounts";
import { createEditorialMediaOperations, type createEditorialMedia, type EditorialMediaAccess } from "./editorialMedia";
import type { createHostedMediaBytes } from "./storage/editorialMediaBytes";

export type EditorialMediaService = {
  authority(): Promise<EditorialAuthority>;
  persistence: EditorialPersistence;
  media: ReturnType<typeof createEditorialMedia>;
  bytes: ReturnType<typeof createHostedMediaBytes>;
};
type Account = NonNullable<Awaited<ReturnType<typeof readIdentityAccount>>>;
export type ContextDependencies = { service?: EditorialMediaService; accounts: D1Database; session(): Promise<{ user: { id: string } } | null> };

const forbidden = () => new MediaIngestionError("forbidden", "Você não tem permissão para gerenciar o acervo de mídia.");
const isManager = (account: Account | null): account is Account => !!account && !account.disabled && (account.claims.admin === true || account.claims.editor === true);

/** An account row that no longer parses is a server failure; only Media input is the caller's validation error. */
export async function readAccount(accounts: D1Database, uid: string) {
  try {
    return await readIdentityAccount(accounts, uid);
  }
  catch (error) {
    if (error instanceof z.ZodError) throw new StoredMediaDataError(error);
    throw error;
  }
}

/** The same live-role rule as the Firestore composition: administration needs `admin`, every other channel `editor`. */
function liveAccess(accounts: D1Database, persistence: EditorialPersistence): EditorialMediaAccess {
  const permissions = createLegacySourcePermissions(persistence);
  return {
    async authorize(details) {
      const account = await readAccount(accounts, details.editorId);
      if (!account || account.disabled || account.claims[details.channel === "administration" ? "admin" : "editor"] !== true) throw forbidden();
    },
    hasMediaUsePermission: permissionId => permissions.hasMediaUsePermission(permissionId, Date.now()),
  };
}

async function openService(dependencies: Pick<ContextDependencies, "service">) {
  const { service } = dependencies;
  if (!service || await service.authority() !== "worker") throw new TRPCError({ code: "NOT_FOUND" });
  return service;
}

/** A live administrator or editor of an open editorial authority; the session is the only accepted caller. */
export async function manager(dependencies: ContextDependencies) {
  const service = await openService(dependencies);
  const uid = (await dependencies.session())?.user.id;
  const account = uid ? await readAccount(dependencies.accounts, uid) : null;
  if (!isManager(account)) throw new TRPCError({ code: "FORBIDDEN" });
  return { service, account };
}

/** Administrators ingest through the administration channel, editors through the newsroom; reservation owners follow it. */
function ingestionCaller(account: Account) {
  return account.claims.admin === true
    ? { caller: administrativeMediaCaller(account.uid), ownerId: mediaOwnerId({ channel: "administration", editorId: account.uid }) }
    : { caller: firstPartyEditorialCaller(account.uid), ownerId: mediaOwnerId({ channel: "newsroom", editorId: account.uid }) };
}

function requireAdministrator(account: Account) {
  if (account.claims.admin !== true) throw new TRPCError({ code: "FORBIDDEN" });
}

type CorrectionResult = Awaited<ReturnType<ReturnType<typeof createEditorialMediaOperations>["correction"]["correct"]>>;
/** A correction that wrote nothing is an error, as in the legacy entry point, so no client reads it as applied. */
function appliedCorrection(result: CorrectionResult) {
  if (result.status === "not-found") throw new MediaNotFoundError();
  if (result.status !== "conflict") return result;
  if (result.code === "idempotency_conflict") throw new MediaIngestionError("duplicate", "A chave já identifica outra correção.");
  throw new MediaRevisionConflictError(result.currentRevision);
}

export async function mediaContext(dependencies: ContextDependencies) {
  const { service, account } = await manager(dependencies);
  const { media, persistence } = service;
  const operations = createEditorialMediaOperations({ persistence, media, access: liveAccess(dependencies.accounts, persistence) });
  const { caller } = ingestionCaller(account);
  const editor = () => {
    if (account.claims.editor !== true) throw new TRPCError({ code: "FORBIDDEN" });
    return firstPartyEditorialCaller(account.uid);
  };
  const reads: Record<MediaReadOperation, (input: never, requestId?: string) => Promise<unknown>> = {
    "search": input => media.search.search(input),
    "get": input => media.catalog.get(input),
    "byIds": input => media.catalog.byIds(input),
    "revisions": input => media.catalog.listRevisions(input),
    "unreferenced": (input) => {
      requireAdministrator(account);
      return media.search.reportUnreferenced(input, { hasReference: async id => (await persistence.page({ kind: "article", mediaId: id, limit: 1 })).items.length > 0 });
    },
    "ingestion.get": input => operations.ingestion.get(caller, input),
    "ingestion.search": (input, requestId) => operations.ingestion.search(caller, input, requestId),
  };
  const writes: Record<MediaWriteOperation, (input: never) => Promise<unknown>> = {
    "ingestion.prepare": input => operations.ingestion.prepare(caller, input),
    "ingestion.finalize": input => operations.ingestion.finalize(caller, input),
    "ingestion.reconcile": input => operations.ingestion.reconcile(caller, input),
    "correct": async input => appliedCorrection(await operations.correction.correct(editor(), input)),
    "update": (input: Record<string, unknown>) => {
      requireAdministrator(account);
      // A dual-role account edits as an Editor: only `correct` records the required reason and Editorial Activity.
      if (account.claims.editor === true) throw new TRPCError({ code: "FORBIDDEN" });
      return media.revisions.update({ ...input, actorId: account.uid } as never);
    },
  };
  return {
    read: (operation: MediaReadOperation, input: unknown, requestId?: string) => reads[operation](input as never, requestId),
    write: (operation: MediaWriteOperation, input: unknown) => writes[operation](input as never),
  };
}

export function mediaError(error: unknown): MediaErrorShape | undefined {
  if (error instanceof MediaIngestionError) return { name: "MediaIngestionError", code: error.code, details: z.record(z.string(), z.json()).catch({}).parse(error.details) };
  if (error instanceof MediaNotFoundError) return { name: "MediaNotFoundError", details: {} };
  if (error instanceof MediaRevisionConflictError) return { name: "MediaRevisionConflictError", details: { currentRevision: error.currentRevision } };
  if (error instanceof z.ZodError || error instanceof TypeError) return { name: "ValidationError", details: {} };
  return undefined;
}

const ingestionCodes: Partial<Record<string, TRPCError["code"]>> = { forbidden: "FORBIDDEN", notFound: "NOT_FOUND", duplicate: "CONFLICT", revisionConflict: "CONFLICT", internalFailure: "INTERNAL_SERVER_ERROR" };
function procedureCode(error: MediaErrorShape): TRPCError["code"] {
  if (error.name === "MediaNotFoundError") return "NOT_FOUND";
  if (error.name === "MediaRevisionConflictError") return "CONFLICT";
  return ingestionCodes[error.code ?? ""] ?? "BAD_REQUEST";
}

/** Domain errors keep their messages for people; anything else surfaces as an internal failure. */
export async function mediaProcedure<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  }
  catch (cause) {
    const known = mediaErrorSchema.safeParse(mediaError(cause));
    if (!known.success) throw cause;
    throw new TRPCError({ code: procedureCode(known.data), message: cause instanceof Error && known.data.name !== "ValidationError" ? cause.message : "Dados de Mídia inválidos.", cause: cause instanceof Error ? cause : undefined });
  }
}

const privateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const uploadRoute = /^\/api\/media\/uploads\/([a-f0-9]{64})$/;
// Media ids keep the 1,500-byte bound of their Firestore source; the segment allows every such id percent-encoded.
const mediaIdBytes = 1500;
const contentRoute = new RegExp(`^/api/media/content/([^/]{1,${mediaIdBytes * 3}})$`);
export const isMediaRoute = (path: string) => uploadRoute.test(path) || contentRoute.test(path);

/** The public answer to any unexpected Media failure; it names the capability and nothing about the cause. */
export const mediaUnavailableMessage = "Não foi possível acessar o acervo de mídia. Tente novamente.";
/** The normalized failure route of a Media request, so operators can tell uploads, previews and procedures apart. */
export function mediaFailureRoute(path: string) {
  if (uploadRoute.test(path)) return "/api/media/uploads/:reservationId";
  if (contentRoute.test(path)) return "/api/media/content/:mediaId";
  if (path === editorialAuthorityPath) return path;
  return /^\/api\/trpc\/media(Read|Write)$/.test(path) ? `/api/trpc/media${path.endsWith("Read") ? "Read" : "Write"}` : undefined;
}
export const mediaUploadBodyLimit = mediaUploadLimits.maxBytes;

function status(error: unknown) {
  if (error instanceof TRPCError) return error.code === "NOT_FOUND" ? 404 : 403;
  if (error instanceof MediaIngestionError && error.details.uploadConflict === true) return 409;
  if (error instanceof MediaIngestionError) return { forbidden: 403, notFound: 404, internalFailure: 503 }[error.code as string] ?? 400;
  // A malformed percent-encoded Media id is the caller's error, not an unavailable service.
  if (error instanceof URIError) return 400;
  throw error;
}

async function receiveUpload(request: Request, dependencies: ContextDependencies, reservationId: string) {
  if (request.method !== "PUT") return new Response(null, { status: 405, headers: { ...privateHeaders, allow: "PUT" } });
  const { service, account } = await manager(dependencies);
  const record = await service.persistence.read("uploadReservation", reservationId);
  // Parsed before the owner check, so a corrupt reservation is a Media failure rather than someone else's.
  if (!record || toReservation(record).ownerId !== ingestionCaller(account).ownerId) throw forbidden();
  // The signed upload names the reserved type; bytes of another type are checked again by their signature.
  if (request.headers.get("content-type") !== toReservation(record).input.contentType) throw new MediaIngestionError("validationFailed", "O tipo do arquivo divergiu do reservado.");
  await service.bytes.storeUpload(reservationId, new Uint8Array(await request.arrayBuffer()));
  return new Response(null, { status: 204, headers: privateHeaders });
}

async function deliverContent(request: Request, dependencies: ContextDependencies, mediaId: string) {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...privateHeaders, allow: "GET" } });
  const { service } = await manager(dependencies);
  const media = await service.media.catalog.get(mediaId);
  // Only staged or active Media with its canonical sanitized path has previewable bytes.
  if (!media?.digest || !sanitizedMediaPath(media, media.digest)) return new Response(null, { status: 404, headers: privateHeaders });
  const bytes = await service.bytes.readMedia(media.digest);
  // Canonical Media without its bytes is lost storage, a Media failure; never an ordinary absence.
  if (!bytes) throw new Error(`Os bytes da Mídia ${mediaId} não estão disponíveis.`);
  return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "content-type": "image/webp" } });
}

/** Upload bytes and private previews; both require a live administrator or editor of an open authority. */
export async function serveMedia(request: Request, path: string, dependencies: ContextDependencies) {
  try {
    const upload = uploadRoute.exec(path);
    if (upload) return await receiveUpload(request, dependencies, upload[1]!);
    const mediaId = decodeURIComponent(contentRoute.exec(path)![1]!);
    if (new TextEncoder().encode(mediaId).byteLength > mediaIdBytes) return new Response(null, { status: 404, headers: privateHeaders });
    return await deliverContent(request, dependencies, mediaId);
  }
  catch (error) {
    return new Response(null, { status: status(error), headers: privateHeaders });
  }
}
