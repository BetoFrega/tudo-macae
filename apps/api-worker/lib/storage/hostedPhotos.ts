import { createReservedPhotoObjects, PhotoObjectUnavailable, photoByteLimit, photoDeliveryByteLimit, photoLeaseMs, type PhotoObjectJournal, type PhotoRecord, type ReservedObjectRecord } from "@tudomacae/classifieds-photos";
import { createHash } from "node:crypto";
import { hostedPhotoVariant } from "../../hostedPhotoVariants";

// In production `image(id)` returns a JSRPC stub; workerd warns "An RPC stub was not disposed properly" when one is collected undisposed.
type HostedImage = Pick<ImageHandle, "details" | "bytes" | "delete" | "signedUrl"> & { [Symbol.dispose]?(): void };
type HostedImages = {
  createDirectUpload: HostedImagesBinding["createDirectUpload"];
  image(id: string): HostedImage;
};
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const deliveredTypes = ["image/avif", "image/webp", "image/jpeg", "image/png", "image/gif"];

type DeploymentContext = { environment: string; release: string; executionId?: string };

/** Disposes the handle after `operation` on every path; a disposal failure never replaces its result or error. */
async function withImage<T>(images: HostedImages, context: DeploymentContext & { releaseEvent: string }, id: string, operation: (image: HostedImage) => Promise<T>) {
  const image = images.image(id);
  try {
    return await operation(image);
  }
  finally {
    try {
      image[Symbol.dispose]?.();
    }
    catch (error) {
      // Without this signal a failed release shows up only as the runtime's undisposed-stub warning. Messages may carry provider details.
      const { releaseEvent, ...deployment } = context;
      console.warn(JSON.stringify({ event: releaseEvent, service: "api-worker", ...deployment, outcome: "failed", errorName: error instanceof Error ? error.name : "unknown" }));
    }
  }
}

/** Reads the whole stream, calling `fail` as soon as it exceeds `limit`. */
async function readBounded(stream: ReadableStream<Uint8Array>, limit: number, fail: () => Error) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw fail();
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

/** Accepts only a successful image response whose declared size, if any, fits the delivery bound. */
async function deliveredVariant(response: Response, fail: () => Error) {
  const mimeType = response.headers.get("content-type");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (response.ok && response.body && mimeType && deliveredTypes.includes(mimeType) && declaredSize <= photoDeliveryByteLimit) return { body: response.body, mimeType };
  await response.body?.cancel();
  throw fail();
}

/** Confirms the stream is not empty, then cancels it without reading the rest. */
async function readFirstChunk(stream: ReadableStream<Uint8Array>, fail: () => Error) {
  const reader = stream.getReader();
  const first = await reader.read().finally(() => reader.cancel());
  if (first.done || !first.value.byteLength) throw fail();
}

// Workers reject `redirect: "error"`; with "manual" a redirect fails the `ok` checks below instead of being followed.
export function createHostedPhotoObjects<R extends ReservedObjectRecord = PhotoRecord>(input: {
  images: HostedImages; send: typeof fetch; now(): number; newId(): string; context?: DeploymentContext;
  /** Names the capability that owns a failed handle release; Classifieds photos unless a caller says otherwise. */
  releaseEvent?: string;
}, journal: PhotoObjectJournal<R>) {
  const context = { ...input.context ?? { environment: "unknown", release: "unknown" }, releaseEvent: input.releaseEvent ?? "classifieds.photos.hosted_image_release" };
  // A plain call: workerd rejects the global fetch invoked as a method of `input` (Illegal invocation).
  const send = input.send;
  /** True only when the finished upload belongs to this record; false while absent or a draft. */
  async function verified(record: R, image: HostedImage) {
    const metadata = await image.details();
    if (!metadata || metadata.draft) return false;
    if (!metadata.requireSignedURLs || metadata.meta?.operationId !== record.operationId || metadata.meta?.digest !== record.digest) throw new PhotoObjectUnavailable("verification", record.operationId);
    return true;
  }
  async function original(record: R, image: HostedImage) {
    if (!await verified(record, image)) return null;
    const unavailable = () => new PhotoObjectUnavailable("verification", record.operationId);
    const stream = await image.bytes();
    if (!stream) throw unavailable();
    const bytes = await readBounded(stream, Math.min(photoByteLimit, record.size), unavailable);
    if (bytes.byteLength !== record.size || digest(bytes) !== record.digest) throw unavailable();
    return { bytes, mimeType: record.mimeType };
  }
  /** A probe issues the same GET (HEAD semantics on signed variant URLs are unverified) but stops at the first chunk, so it fails where GET fails without buffering the variant. */
  async function deliver(record: R, image: HostedImage, delivery: { width: number; format: string }, probe: boolean) {
    if (!await verified(record, image)) return null;
    const unavailable = () => new PhotoObjectUnavailable("verification", record.operationId);
    const url = await image.signedUrl({ variant: hostedPhotoVariant(delivery.width), expiresIn: 60 });
    const response = await send(url, { headers: { accept: `image/${delivery.format}` }, redirect: "manual", signal: AbortSignal.timeout(5000) });
    const { body, mimeType } = await deliveredVariant(response, unavailable);
    if (probe) {
      await readFirstChunk(body, unavailable);
      return { bytes: new Uint8Array(), mimeType, delivered: true as const };
    }
    const bytes = await readBounded(body, photoDeliveryByteLimit, unavailable);
    if (!bytes.byteLength) throw unavailable();
    return { bytes, mimeType, delivered: true as const };
  }
  return createReservedPhotoObjects<R>({ journal, now: input.now, newId: input.newId, digest: async bytes => digest(bytes), provider: {
    allocate: record => input.images.createDirectUpload({ requireSignedURLs: true, expiresIn: photoLeaseMs / 1000, metadata: { operationId: record.operationId, digest: record.digest } }),
    async upload(record, reservation, bytes) {
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(bytes)], { type: record.mimeType }), "image");
      const response = await send(reservation.uploadURL!, { method: "POST", body: form, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      await response.body?.cancel();
      if (!response.ok) throw new PhotoObjectUnavailable("upload", record.operationId);
    },
    read: (record, id) => withImage(input.images, context, id, image => original(record, image)),
    deliver: (record, id, delivery, probe = false) => withImage(input.images, context, id, image => deliver(record, image, delivery, probe)),
    head: (record, id) => withImage(input.images, context, id, image => verified(record, image)),
    delete: id => withImage(input.images, context, id, image => image.delete()),
    exists: id => withImage(input.images, context, id, async image => !!await image.details()),
  } });
}
