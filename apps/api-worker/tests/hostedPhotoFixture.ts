import { createHostedClassifiedsPhotos, createHostedPhotos } from "../hostedPhotos";
import { PhotoError, PhotoObjectUnavailable } from "@tudomacae/classifieds-photos";

/** Durable local substitute for the Hosted API over R2; production never imports it. */
export function createHostedImagesFake(input: { bucket: R2Bucket; images?: ImagesBinding; failure?: "upload" | "verification" | "deletion" | "busy" }) {
  const images = {
    async createDirectUpload(options?: ImageDirectUploadOptions) {
      const id = crypto.randomUUID();
      const metadata = { id, requireSignedURLs: options?.requireSignedURLs ?? false, draft: true, variants: [], meta: options?.metadata };
      await input.bucket.put(`hosted/${id}`, "", { customMetadata: { metadata: JSON.stringify(metadata) } });
      return { id, uploadURL: `https://hosted.fixture/upload/${id}` };
    },
    image(id: string) {
      return {
        async details() {
          const object = await input.bucket.head(`hosted/${id}`);
          return object ? JSON.parse(object.customMetadata!.metadata!) as ImageMetadata : null;
        },
        async bytes() { return (await input.bucket.get(`hosted/${id}`))?.body ?? null; },
        async delete() {
          if (input.failure === "deletion") throw new Error("Fixture deletion failure");
          await input.bucket.delete(`hosted/${id}`);
          return true;
        },
        async signedUrl(options: ImageSignedUrlOptions) { return `https://hosted.fixture/variant/${id}/${options.variant}?token=disposable`; },
      };
    },
  };
  async function storeUpload(id: string, metadata: ImageMetadata, init?: RequestInit) {
    if (!(init?.body instanceof FormData)) throw new Error("Fixture upload body missing");
    const file = init.body.get("file");
    if (!(file instanceof Blob)) throw new Error("Fixture file missing");
    await input.bucket.put(`hosted/${id}`, await file.arrayBuffer(), { customMetadata: { metadata: JSON.stringify({ ...metadata, draft: false }) } });
    if (input.failure === "upload") throw new Error("Fixture lost upload response");
    return new Response(null, { status: 200 });
  }
  async function renderVariant(id: string, variant: string, init?: RequestInit) {
    const body = await images.image(id).bytes();
    if (!body) return new Response(null, { status: 404 });
    const accept = new Headers(init?.headers).get("accept");
    const format = accept === "image/jpeg" || accept === "image/avif" ? accept : "image/webp";
    if (!input.images) throw new Error("Fixture transformation binding missing");
    return input.images.input(body).transform({ width: Number(variant.slice(1)), fit: "scale-down" }).output({ format, anim: false, quality: 75 }).then(output => output.response());
  }
  const send: typeof fetch = async (target, init) => {
    const url = new URL(String(target));
    const [, action, id, variant = ""] = url.pathname.split("/");
    if (!id) throw new Error("Fixture ID missing");
    const metadata = await images.image(id).details();
    if (!metadata) return new Response(null, { status: 404 });
    if (action === "upload") return storeUpload(id, metadata, init);
    if (action !== "variant" || metadata.draft || !/^w\d+$/.test(variant)) return new Response(null, { status: 404 });
    return renderVariant(id, variant, init);
  };
  return { images, send };
}

export function createHostedPhotoObjectFixture(input: { database: D1Database; bucket: R2Bucket; images?: ImagesBinding; failure?: "upload" | "verification" | "deletion" | "busy" }) {
  const { images, send } = createHostedImagesFake(input);
  const now = Date.now;
  const newId = () => crypto.randomUUID();
  const objects = createHostedPhotos({ database: input.database, images, send, now, newId });
  return { objects, images, send };
}

/** The offline simulator wraps known malformed-byte errors in HTTP 500; production reports them as code 9412. */
export function offlineImagesProcessing(images: ImagesBinding) {
  return {
    input: images.input.bind(images),
    async info(stream: ReadableStream<Uint8Array>) {
      try {
        return await images.info(stream);
      }
      catch (error) {
        if (error instanceof Error && /Input buffer (has corrupt header|contains unsupported image format)/.test(error.message)) throw Object.assign(new Error("Invalid fixture image"), { code: 9412 });
        throw error;
      }
    },
  };
}

export function createHostedPhotoFixture(input: { database: D1Database; bucket: R2Bucket; images: ImagesBinding; failure?: "upload" | "verification" | "deletion" | "busy" }) {
  const { objects, images, send } = createHostedPhotoObjectFixture(input);
  const now = Date.now;
  const newId = () => crypto.randomUUID();
  const processing = offlineImagesProcessing(input.images);
  const lifecycle = createHostedClassifiedsPhotos({ database: input.database, images: { ...processing, hosted: images },
    send, now, newId, purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: () => {} });
  return { objects, images, send, lifecycle: input.failure === "verification" || input.failure === "busy"
    ? {
        ...lifecycle,
        async upload(_actor: Parameters<typeof lifecycle.upload>[0], request: Parameters<typeof lifecycle.upload>[1]) {
          if (input.failure === "busy") throw new PhotoError("conflict", "Aguarde o envio em andamento.");
          throw new PhotoObjectUnavailable("verification", request.operationId);
        },
      }
    : lifecycle };
}
