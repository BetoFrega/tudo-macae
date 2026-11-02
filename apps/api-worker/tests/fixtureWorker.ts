import { runAuthenticationMaintenance } from "../lib/authenticationMaintenance";
import { createOfferingFlag } from "@tudomacae/advertiser-identity/offeringFlag";
import { createD1PhotoStore } from "../classifiedsPhotos";
import { createClassifiedsPersistence } from "../classifieds";
import { createPhotoTransfer, photoInventorySchema } from "@tudomacae/classifieds-photos/transfer";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createApiWorker } from "../index";
import { createSiteverify } from "../lib/siteverify";
import { createLocalJWKSet, type JSONWebKeySet } from "jose";
import type { AuthenticationDiagnosticEvent } from "@tudomacae/authentication/diagnostics";
const capturedDiagnostics: AuthenticationDiagnosticEvent[] = [];
import { createHostedImagesFake, createHostedPhotoFixture, offlineImagesProcessing } from "./hostedPhotoFixture";
import { createEditorialPersistence } from "../editorial";
import { createEditorialMedia } from "../lib/editorialMedia";
import { createHostedMediaBytes } from "../lib/storage/editorialMediaBytes";
type FixtureEnv = Env & {
  MAILBOX: Fetcher;
  OFFERING_FLAGS?: Fetcher;
  PHOTOS: R2Bucket;
  IMAGES: ImagesBinding;
  TEST_SERVICE_KEYS: JSONWebKeySet;
  CLASSIFIEDS_QUALIFICATION?: string;
  MEDIA_HOSTED: R2Bucket;
  MEDIA_UPLOAD_ORIGIN?: string;
};

/** Media over the editorial D1 and the R2-backed Hosted fake, wired like the production composition. */
function editorialMedia(env: FixtureEnv) {
  // Stacks without the editorial D1 (the E2E app stack) keep the legacy source, as a deployment without it does.
  if (!(env.EDITORIAL_DB as D1Database | undefined)) return undefined;
  const persistence = createEditorialPersistence({ database: env.EDITORIAL_DB });
  const bytes = createHostedMediaBytes({
    ...createHostedImagesFake({ bucket: env.MEDIA_HOSTED, images: env.IMAGES }), now: Date.now, newId: () => crypto.randomUUID(),
    persistence, processing: offlineImagesProcessing(env.IMAGES),
    signUpload: async reservation => ({ url: `${env.MEDIA_UPLOAD_ORIGIN ?? env.PUBLIC_APP_ORIGIN}/midia/envios/${reservation.id}`, headers: { "content-type": reservation.input.contentType } }),
  });
  return { persistence, bytes, media: createEditorialMedia({ persistence, bytes }) };
}
const fixtureWorker = {
  async fetch(request: Request, env: FixtureEnv) {
    if (new URL(request.url).pathname === "/__fixture/diagnostics") return Response.json(capturedDiagnostics.splice(0));
    if (new URL(request.url).pathname === "/__fixture/photos/import") {
      const value = z.object({ item: photoInventorySchema, bytes: z.array(z.number()) }).parse(await request.json());
      const transfer = createPhotoTransfer({ store: createD1PhotoStore(env.CLASSIFIEDS_DB, createClassifiedsPersistence({ database: env.CLASSIFIEDS_DB })), objects: createHostedPhotoFixture({ database: env.CLASSIFIEDS_DB, bucket: env.PHOTOS, images: env.IMAGES }).objects, now: () => 1_800_000_000_000,
        digest: async bytes => createHash("sha256").update(bytes).digest("hex"), source: async () => ({ bytes: new Uint8Array(value.bytes), generation: value.item.sourceGeneration, mimeType: value.item.mimeType }) });
      return Response.json(await transfer.importItem(value.item, false));
    }
    const database = request.headers.get("x-fixture-classifieds-unavailable") === "true"
      ? new Proxy(env.CLASSIFIEDS_DB, { get(target, property) {
          if (property === "prepare") return (sql: string) => target.prepare(sql.includes("classifieds_records") ? "SELECT * FROM missing_classifieds_fixture" : sql);
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        } })
      : env.CLASSIFIEDS_DB;
    const failurePhase = z.enum(["upload", "verification", "deletion", "busy"]).safeParse(request.headers.get("x-fixture-hosted-failure"));
    return createApiWorker({
      ...(request.headers.get("x-fixture-diagnostics") === "capture" ? { writeDiagnostic: (event: AuthenticationDiagnosticEvent) => capturedDiagnostics.push(event) } : {}),
      // Stands in for a call through the `WebRenderer` service binding.
      ...(request.headers.get("x-fixture-bound-renderer") === "1" ? { boundRenderer: true } : {}),
      verifyHumanChallenge: createSiteverify(fetch),
      editorialMedia: () => editorialMedia(env),
      // The fixture has no image CDN to purge, so retiring editorial images confirms; without this, a save that
      // retires one answers `unconfirmed`. Failing and stalled purges are covered by `editorialBlogMediaCleanup.runtime.test.ts`.
      editorialImagePurge: () => async () => ({ success: true }),
      classifiedsPersistence: () => createClassifiedsPersistence({ database }),
      classifiedsPhotos: environment => createHostedPhotoFixture({ database: environment.CLASSIFIEDS_DB, bucket: env.PHOTOS, images: env.IMAGES, ...(failurePhase.success ? { failure: failurePhase.data } : {}) }).lifecycle,
      classifiedsOfferingFlag: () => createOfferingFlag({ host: "https://offering-flags.test", token: "disposable-catalog-fixture", fetch: (url, init) => env.OFFERING_FLAGS ? env.OFFERING_FLAGS.fetch(url, init) : Promise.resolve(new Response(null, { status: 503 })) }),
      classifiedsQualification: async () => env.CLASSIFIEDS_QUALIFICATION === "d1",
      classifiedsPhotoUrl: path => `/api/classifieds/photos/public/${encodeURIComponent(path)}`,
      serviceKeys: createLocalJWKSet(env.TEST_SERVICE_KEYS),
      async sendMail(mail) {
        const response = await env.MAILBOX.fetch("https://mailbox.test/send", {
          method: "POST",
          body: JSON.stringify(mail),
        });
        if (!response.ok) throw new Error("Email delivery unavailable");
      },
    }).fetch(request, { ...env, CLASSIFIEDS_DB: database });
  },
  /** Runs only the Media and authentication maintenance; Classifieds maintenance has its own fixture. */
  async scheduled(controller: ScheduledController, env: FixtureEnv) {
    await createApiWorker({ editorialMedia: () => editorialMedia(env), expireAuthentication: (_, now) => runAuthenticationMaintenance(env.AUTHENTICATION_DB, env.WORKERS_ENVIRONMENT, now) }).scheduled(controller, env);
  },
};

export default fixtureWorker;
