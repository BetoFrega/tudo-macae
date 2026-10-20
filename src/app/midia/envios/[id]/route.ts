import { mediaUploadLimits } from "@tudomacae/media/ingestionPolicy";
import { responseFailure } from "@tudomacae/editorial-media/client";
import { reportMediaFailure, type WorkerMedia, workerMedia } from "@/packages/media-api";

const noStore = { "cache-control": "private, no-store" };

/** Reads at most the upload limit; a declared length can be absent or false, so the count is kept while reading. */
async function boundedBody(request: Request) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
    size += chunk.value.byteLength;
    if (size > mediaUploadLimits.maxBytes) {
      await reader?.cancel();
      return undefined;
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(size);
  chunks.reduce((offset, part) => (body.set(part, offset), offset + part.byteLength), 0);
  return body.buffer;
}

function unavailable(error: unknown) {
  reportMediaFailure(error, "media.upload.bytes", "/midia/envios/[id]");
  return new Response(null, { status: 503, headers: noStore });
}

/** The bytes go to the Worker's reservation with the editor's session. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let worker: WorkerMedia;
  try {
    worker = await workerMedia();
  }
  catch (error) {
    return unavailable(error);
  }
  if (Number(request.headers.get("content-length") ?? 0) > mediaUploadLimits.maxBytes) return new Response(null, { status: 413, headers: noStore });
  const body = await boundedBody(request);
  if (!body) return new Response(null, { status: 413, headers: noStore });
  let response: Response;
  try {
    response = await worker.upload(id, body, request.headers.get("content-type") ?? "");
  }
  catch (error) {
    return unavailable(error);
  }
  await response.body?.cancel();
  if (response.status >= 500) reportMediaFailure(responseFailure(response), "media.upload.bytes", "/midia/envios/[id]");
  return new Response(null, { status: response.status, headers: noStore });
}
