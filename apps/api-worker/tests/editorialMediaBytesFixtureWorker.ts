import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { z } from "zod";
import { createEditorialPersistence } from "../editorial";
import { createEditorialMedia } from "../lib/editorialMedia";
import { createHostedMediaBytes } from "../lib/storage/editorialMediaBytes";
import { createHostedImagesFake, offlineImagesProcessing } from "./hostedPhotoFixture";

const inputSchema = z.object({
  action: z.enum(["prepare", "upload", "finalize", "sweep", "media", "record"]),
  input: z.any().optional(),
  operationId: z.string().default("operation"),
  /** Base64 bytes of an upload. */
  bytes: z.string().optional(),
  /** Base64 bytes another upload stores right after this upload's duplicate check reads the reservation. */
  racedBytes: z.string().optional(),
  now: z.number().default(Date.now()),
});
type FixtureEnv = { EDITORIAL_DB: D1Database; IMAGES: ImagesBinding; HOSTED: R2Bucket };

const decode = (value = "") => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const owner = "a".repeat(64);

function hostedBytes(env: FixtureEnv, persistence: EditorialPersistence, now: () => number) {
  return createHostedMediaBytes({
    ...createHostedImagesFake({ bucket: env.HOSTED, images: env.IMAGES }), now, newId: () => crypto.randomUUID(),
    persistence, processing: offlineImagesProcessing(env.IMAGES),
    signUpload: async reservation => ({ url: `https://api.test/media/uploads/${reservation.id}`, headers: { "content-type": reservation.input.contentType } }),
  });
}

/** Lets the raced upload commit between this upload's duplicate check and its own journal write. */
function racedPersistence(persistence: EditorialPersistence, race: () => Promise<void>): EditorialPersistence {
  let reservationReads = 0;
  return { ...persistence, async read(kind, id, namespace) {
    const record = await persistence.read(kind, id, namespace);
    if (kind === "uploadReservation" && ++reservationReads === 2) await race();
    return record;
  } };
}

async function run(input: z.infer<typeof inputSchema>, env: FixtureEnv) {
  const stored = createEditorialPersistence({ database: env.EDITORIAL_DB });
  const now = () => input.now;
  const raced = input.racedBytes;
  const persistence = raced ? racedPersistence(stored, () => hostedBytes(env, stored, now).storeUpload(input.input, decode(raced))) : stored;
  const bytes = hostedBytes(env, persistence, now);
  const media = createEditorialMedia({ persistence, bytes, now });
  const value = input.input;
  const actions: Record<z.infer<typeof inputSchema>["action"], () => Promise<unknown>> = {
    prepare: () => media.preparation.prepare(owner, input.operationId, value),
    upload: () => bytes.storeUpload(value, decode(input.bytes)),
    finalize: () => media.finalization.finalize(owner, input.operationId, value),
    sweep: () => media.quarantine.sweep(value),
    media: async () => {
      const content = await bytes.readMedia(value);
      return content && encode(content);
    },
    record: () => persistence.read(value.kind, value.id),
  };
  return actions[input.action]();
}

const worker = {
  async fetch(request: Request, env: FixtureEnv) {
    try {
      return Response.json({ value: await run(inputSchema.parse(await request.json()), env) ?? null });
    }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      return Response.json({ error: failure.name, message: failure.message, code: (failure as { code?: string }).code });
    }
  },
};

export default worker;
