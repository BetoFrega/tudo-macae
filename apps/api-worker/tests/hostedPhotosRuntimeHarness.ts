import { afterAll, beforeAll, afterEach, beforeEach, expect } from "vitest";
import { Miniflare } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createHostedPhotos } from "../hostedPhotos";
import { createClassifiedsPersistence } from "../classifieds";
import { type PhotoRecord } from "@tudomacae/classifieds-photos";
import { copyMigratedDatabase } from "./migratedDatabase";

export let runtime: Miniflare;
let directory: string;
export let options: ConstructorParameters<typeof Miniflare>[0];
export let now: number;
export const classifiedsDatabase = () => runtime.getD1Database("CLASSIFIEDS_DB");
export const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const record: PhotoRecord = {
  path: "ad-images/ad/pending/photo.png", id: "photo", ownerKind: "ad", ownerId: "ad",
  operationId: "2cae4f1e-2ed8-4d7c-a463-b3747872a470", digest: createHash("sha256").update(bytes).digest("hex"),
  size: bytes.byteLength, mimeType: "image/png", status: "reserved", createdAt: 0, updatedAt: 0,
  expiresAt: 0, retryAt: 0, attempts: 0, reservedRevision: 2, title: "", description: "",
};
let templates: string;
beforeAll(async () => {
  templates = await mkdtemp(join(tmpdir(), "hosted-photos-template-"));
});
afterAll(async () => {
  await rm(templates, { recursive: true, force: true });
});
beforeEach(async () => {
  now = 1_800_000_000_000;
  directory = await mkdtemp(join(tmpdir(), "hosted-photos-"));
  options = { resourcePersistencePath: directory, workers: [{ config: {
    name: "hosted", compatibilityDate: "2026-09-25",
    env: { CLASSIFIEDS_DB: { type: "d1", id: "hosted" }, IMAGES: { type: "images" } },
    manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: "export default { fetch() { return new Response('ok'); } };" } }, modulesRoot: directory },
  } }] };
  await copyMigratedDatabase(options, join(templates, "template"), "CLASSIFIEDS_DB", ["0001_classifieds.sql", "0002_classifieds_lookups.sql", "0003_classifieds_photos.sql", "0004_classifieds_ad_order.sql", "0005_classifieds_cleanup_handoffs.sql"]);
  runtime = new Miniflare(options);
  await runtime.ready;
});
afterEach(async () => {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
});
export function provider(path = record.path) {
  const items = new Map<string, { metadata: ImageMetadata; bytes?: Uint8Array }>();
  let allocations = 0;
  let lost = false;
  let sent = 0;
  let beforeSend = async () => {};
  let beforeDelivery = async () => {};
  let originalReads = 0;
  const handles = { opened: 0, disposed: 0 };
  let dispose = () => {};
  const deliveries: { url: string; accept: string | null }[] = [];
  let deliveryResponse = () => new Response(bytes, { headers: { "content-type": "image/webp" } });
  const images = {
    async createDirectUpload(options?: ImageDirectUploadOptions) {
      allocations++;
      // Cloudflare Images ids look like UUIDs but carry non-RFC variant digits (e.g. `2abcb67d-f3ef-4eff-d016-e780c4830a01`).
      const id = crypto.randomUUID().replace(/^(.{19})./, "$1d");
      items.set(id, { metadata: { id, requireSignedURLs: options?.requireSignedURLs ?? false, draft: true, variants: [], meta: options?.metadata } });
      return { id, uploadURL: `https://upload.imagedelivery.net/${id}` };
    },
    image(id: string) {
      handles.opened++;
      return {
        [Symbol.dispose]: () => {
          handles.disposed++;
          dispose();
        },
        details: async () => items.get(id)?.metadata ?? null,
        bytes: async () => {
          originalReads++;
          return items.get(id)?.bytes ? new Blob([new Uint8Array(items.get(id)!.bytes!)]).stream() : null;
        },
        delete: async () => items.delete(id),
        signedUrl: async ({ variant }: ImageSignedUrlOptions) => `https://imagedelivery.net/fixture/${id}/${variant}?token=disposable`,
      };
    },
  };
  const send: typeof fetch = async (url, init) => {
    if (init?.method !== "POST") {
      deliveries.push({ url: String(url), accept: new Headers(init?.headers).get("accept") });
      await beforeDelivery();
      return deliveryResponse();
    }
    sent++;
    const id = String(url).split("/").at(-1)!;
    const item = items.get(id)!;
    const durable = await createClassifiedsPersistence({ database: await classifiedsDatabase() }).read("retirement", path, "classifieds_hosted_photos");
    expect(durable?.body.id).toBe(id);
    expect(init?.body).toBeInstanceOf(FormData);
    await beforeSend();
    if (!(init?.body instanceof FormData)) throw new Error("Expected multipart upload");
    const file = init.body.get("file");
    if (!(file instanceof Blob)) throw new Error("Expected photo bytes");
    item.bytes = new Uint8Array(await file.arrayBuffer());
    item.metadata.draft = false;
    if (lost) throw new Error(`lost provider response: ${url}`);
    return new Response(null);
  };
  async function objects(releaseEvent?: string) {
    return createHostedPhotos({ database: await classifiedsDatabase(), images, now: () => now, newId: () => crypto.randomUUID(), send, context: { environment: "test", release: "fixture" }, ...(releaseEvent ? { releaseEvent } : {}) });
  }
  return { objects, images, send, items, deliveries, originalReads: () => originalReads, handles: () => ({ ...handles }),
    onDispose: (callback: typeof dispose) => {
      dispose = callback;
    },
    reply: (callback: typeof deliveryResponse) => {
      deliveryResponse = callback;
    }, beforeDelivery: (callback: typeof beforeDelivery) => {
      beforeDelivery = callback;
    },
    allocations: () => allocations, sends: () => sent, beforeSend: (effect: () => Promise<void>) => {
      beforeSend = effect;
    }, loseResponse: () => {
      lost = true;
    } };
}
export async function restartRuntime() {
  await runtime.dispose();
  runtime = new Miniflare(options);
  await runtime.ready;
}
export function advanceClock(ms: number) {
  now += ms;
}
