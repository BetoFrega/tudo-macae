import { MediaNotFoundError, MediaRevisionConflictError } from "@tudomacae/media/errors";
import { MediaIngestionError } from "@tudomacae/media/ingestionPolicy";
import { z } from "zod";
import { mediaContentPath, mediaErrorReportedHeader, mediaErrorSchema, mediaUploadPath, type MediaErrorShape, type MediaReadOperation, type MediaWriteOperation } from "./protocol";

/** The Worker could not answer, or answered outside the Media protocol; never a domain decision. */
export class MediaRequestError extends Error {
  constructor(readonly code: "unavailable" | "forbidden" | "incompatible") {
    super(code === "forbidden" ? "Você não tem permissão para gerenciar o acervo de mídia." : "Não foi possível acessar o acervo de mídia. Tente novamente.");
    this.name = "MediaRequestError";
  }
}

const reported = new WeakSet<object>();
/** Whether the Worker marked this failure as one it already logged under its own request id; a gateway 5xx carries no mark. */
export const reportedByWorker = (error: unknown) => typeof error === "object" && error !== null && reported.has(error);
function withProvenance<T extends object>(error: T, response: Response) {
  if (response.headers.get(mediaErrorReportedHeader) === "1") reported.add(error);
  return error;
}
/** The request error a Worker answer without a Media domain error stands for. */
export function responseFailure(response: Response) {
  return withProvenance(new MediaRequestError(response.status === 401 || response.status === 403 ? "forbidden" : "unavailable"), response);
}

const localHostnames = ["localhost", "127.0.0.1", "authentication.test"];
const resultSchema = z.object({ result: z.object({ data: z.unknown() }) });
const failureSchema = z.object({ error: z.object({ message: z.string(), data: z.object({ media: mediaErrorSchema.optional() }).passthrough() }) });
const ingestionCodes = z.enum(["validationFailed", "forbidden", "notFound", "duplicate", "revisionConflict", "internalFailure"]);

/** Rebuilds the domain error the Worker serialized, so callers keep handling it by type. */
function domainError(error: MediaErrorShape, message: string) {
  switch (error.name) {
    case "MediaIngestionError": return new MediaIngestionError(ingestionCodes.catch("internalFailure").parse(error.code), message, error.details);
    case "MediaNotFoundError": return new MediaNotFoundError();
    case "MediaRevisionConflictError": {
      // A conflict without its revision is not a domain answer the editor can act on.
      const revision = z.number().int().nonnegative().safeParse(error.details.currentRevision);
      return revision.success ? new MediaRevisionConflictError(revision.data) : new MediaRequestError("incompatible");
    }
    case "ValidationError": return new TypeError(message);
  }
}

function serviceOrigin(configuration: { origin: string; allowLocal?: boolean }) {
  const origin = new URL(configuration.origin);
  const local = configuration.allowLocal && localHostnames.includes(origin.hostname) && origin.protocol === "http:";
  if ((!local && origin.protocol !== "https:") || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new TypeError("Destino da Mídia inválido.");
  return origin;
}

/**
 * The API Worker's Media procedures and byte routes for one session. `publicOrigin` is the app origin the Worker
 * accepts on mutations; the session is the only credential, so the Worker re-checks the live role on every call.
 */
export function createEditorialMediaClient(configuration: { origin: string; publicOrigin: string; allowLocal?: boolean; request?: typeof fetch }) {
  const origin = serviceOrigin(configuration);
  const publicOrigin = new URL(configuration.publicOrigin).origin;
  // A plain call: workerd rejects the global fetch invoked as a method of `configuration` (Illegal invocation).
  const send = configuration.request ?? fetch;
  function headers(session: string | undefined, extra: Record<string, string> = {}) {
    const value = new Headers({ origin: publicOrigin, ...extra });
    if (session) value.set("cookie", `session=${encodeURIComponent(session)}`);
    return value;
  }
  async function fetchWorker(path: string, init: RequestInit, timeout = 5_000) {
    try {
      return await send(new URL(path, origin), { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(timeout) });
    }
    catch { throw new MediaRequestError("unavailable"); }
  }
  async function procedure<T>(path: string, init: RequestInit, timeout?: number): Promise<T> {
    const response = await fetchWorker(path, init, timeout);
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = failureSchema.safeParse(value);
      const error = failure.data?.error.data.media;
      if (failure.success && error) throw withProvenance(domainError(error, failure.data.error.message), response);
      throw responseFailure(response);
    }
    const result = resultSchema.safeParse(value);
    if (!result.success) throw new MediaRequestError("incompatible");
    return result.data.result.data as T;
  }
  return {
    read<T>(operation: MediaReadOperation, input: unknown, session: string | undefined, requestId?: string) {
      const body = JSON.stringify({ operation, input: input ?? null, ...(requestId ? { requestId } : {}) });
      return procedure<T>(`/api/trpc/mediaRead?input=${encodeURIComponent(body)}`, { method: "GET", headers: headers(session) });
    },
    write<T>(operation: MediaWriteOperation, input: unknown, session: string | undefined) {
      const body = JSON.stringify({ operation, input: input ?? null });
      // Finalization reads, decodes and re-encodes the upload before its durable transitions; a read-sized limit aborts it mid-way.
      const timeout = operation === "ingestion.finalize" ? 30_000 : undefined;
      return procedure<T>("/api/trpc/mediaWrite", { method: "POST", body, headers: headers(session, { "content-type": "application/json" }) }, timeout);
    },
    /** The sanitized bytes of one Media, answered as the Worker answered them. */
    content(mediaId: string, session: string | undefined) {
      return fetchWorker(mediaContentPath(mediaId), { method: "GET", headers: headers(session) });
    },
    /** Forwards an upload's bytes to the reservation; the Worker checks owner, size, type and digest. */
    upload(reservationId: string, body: ArrayBuffer, contentType: string, session: string | undefined) {
      return fetchWorker(mediaUploadPath(reservationId), { method: "PUT", body, headers: headers(session, { "content-type": contentType }) }, 30_000);
    },
  };
}
