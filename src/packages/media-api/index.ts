import { cookies } from "next/headers.js";
import { createEditorialMediaClient, MediaRequestError, reportedByWorker } from "@tudomacae/editorial-media/client";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import type { MediaReadOperation, MediaWriteOperation } from "@tudomacae/editorial-media/protocol";

/** The API Worker's Media for the current session. A missing origin is a broken deployment, so it throws. */
export async function workerMedia() {
  const origin = process.env.AUTHENTICATION_API_URL;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin || !publicOrigin) throw new Error("Media configuration missing");
  const client = createEditorialMediaClient({ origin, publicOrigin, allowLocal: true });
  const session = (await cookies()).get("session")?.value;
  return {
    read: <T>(operation: MediaReadOperation, input: unknown, requestId?: string) => client.read<T>(operation, input, session, requestId),
    write: <T>(operation: MediaWriteOperation, input: unknown) => client.write<T>(operation, input, session),
    content: (mediaId: string) => client.content(mediaId, session),
    upload: (reservationId: string, body: ArrayBuffer, contentType: string) => client.upload(reservationId, body, contentType, session),
  };
}

export type WorkerMedia = Awaited<ReturnType<typeof workerMedia>>;

/**
 * Logs a Media failure at the Next boundary that answers it. A refusal is not a failure, and a 5xx the Worker
 * answered is already logged there, so only requests that never got a protocol answer are reported here.
 */
export { reportedByWorker };
/** Neither a Worker authorization refusal nor a failure the Worker already logged. */
export const unreportedFailure = (error: unknown) => !reportedByWorker(error) && !(error instanceof MediaRequestError && error.code === "forbidden");

export function reportMediaFailure(error: unknown, operation: string, route: string) {
  if (!unreportedFailure(error)) return;
  console.error(JSON.stringify({
    event: "media.action.failed",
    ...publicImageRuntimeContext(),
    route,
    executionId: crypto.randomUUID(),
    operation,
    outcome: "error",
    statusClass: "5xx",
    errorType: error instanceof Error ? error.name : "UnknownError",
    ...(error instanceof MediaRequestError ? { causeCode: error.code } : {}),
  }));
}
