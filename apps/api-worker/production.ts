import { runAuthenticationMaintenance } from "./lib/authenticationMaintenance";
import { createCloudflareImagePurge } from "@tudomacae/public-image-delivery/cloudflarePurge";
import { createEditorialImagePurge } from "@tudomacae/public-image-delivery/editorialPurge";
import { createHostedPhotoVisibilityVerifier } from "./lib/hostedPhotoVisibility";
import { createHostedClassifiedsPhotos } from "./hostedPhotos";
import { createClassifiedsPersistence } from "./classifieds";
import { createD1PhotoStore, createClassifiedsPhotoPurge } from "./classifiedsPhotos";
import type { WorkerDependencies } from "./lib/workerDependencies";
import { createSiteverify } from "./lib/siteverify";
import { createEditorialPersistence } from "./editorial";
import { createEditorialMedia } from "./lib/editorialMedia";
import type { EditorialMediaService } from "./lib/mediaHttp";
import { createHostedMediaBytes } from "./lib/storage/editorialMediaBytes";

/** Media over the editorial D1 and Hosted Images; absent until the deployment binds EDITORIAL_DB. */
export function createProductionEditorialMedia(env: Env, send: typeof fetch = fetch): EditorialMediaService | undefined {
  // Deployments without EDITORIAL_D1_ID drop the binding, so the declared type overstates its presence.
  const database = env.EDITORIAL_DB as D1Database | undefined;
  if (!database) return undefined;
  const persistence = createEditorialPersistence({ database });
  const bytes = createHostedMediaBytes({
    images: env.IMAGES.hosted, processing: env.IMAGES, send, persistence, now: Date.now, newId: () => crypto.randomUUID(),
    context: { environment: env.WORKERS_ENVIRONMENT, release: env.CF_VERSION_METADATA?.id ?? "unknown" },
    // The browser sends bytes to the app, which forwards them with the editor's session to `mediaUploadPath`.
    signUpload: async reservation => ({ url: new URL(`/midia/envios/${reservation.id}`, env.PUBLIC_APP_ORIGIN).href, headers: { "content-type": reservation.input.contentType } }),
  });
  return { persistence, bytes, media: createEditorialMedia({ persistence, bytes }) };
}

/** `sendOrigin` must reach this Worker without its public host: a Worker cannot fetch its own workers.dev URL. */
export function createProductionClassifiedsDependencies(env: Env & { PUBLIC_IMAGE_PURGE_TOKEN?: string }, send: typeof fetch = fetch, sendOrigin: typeof fetch = send): WorkerDependencies {
  const database = env.CLASSIFIEDS_DB;
  return {
    verifyHumanChallenge: createSiteverify(send),
    expireAuthentication: (_, now) => runAuthenticationMaintenance(env.AUTHENTICATION_DB, env.WORKERS_ENVIRONMENT, now),
    editorialMedia: () => createProductionEditorialMedia(env, send),
    editorialImagePurge: () => createEditorialImagePurge({ send, token: env.PUBLIC_IMAGE_PURGE_TOKEN, zoneId: env.PUBLIC_IMAGE_PURGE_ZONE_ID,
      origins: { editorial: env.PUBLIC_APP_ORIGIN, images: env.PUBLIC_IMAGE_ORIGIN } }),
    // Production is past the cutover: the D1 trigger classifieds_authority_no_rollback keeps it from returning to `legacy`.
    classifiedsQualification: async () => true,
    classifiedsPersistence: () => createClassifiedsPersistence({ database }),
    classifiedsPhotoUrl: path => `/api/classifieds/photos/public/${encodeURIComponent(path)}`,
    classifiedsPhotos: (_environment, context) => {
      const store = createD1PhotoStore(database, createClassifiedsPersistence({ database }));
      const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
      return createHostedClassifiedsPhotos({ database, images: env.IMAGES, send,
        context: { environment: env.WORKERS_ENVIRONMENT, release: env.CF_VERSION_METADATA?.id ?? "unknown" },
        purge: createClassifiedsPhotoPurge({ store, classifiedsOrigin: env.OIDC_AUDIENCE,
          adapter: createCloudflareImagePurge({ fetchPurge: send, token: env.PUBLIC_IMAGE_PURGE_TOKEN, zoneId: env.PUBLIC_IMAGE_PURGE_ZONE_ID }), wait,
          verifyVisibility: createHostedPhotoVisibilityVerifier({ send, sendOrigin, classifiedsOrigin: env.OIDC_AUDIENCE, imageOrigin: env.PUBLIC_IMAGE_ORIGIN, purgeToken: env.PUBLIC_IMAGE_PURGE_TOKEN, wait,
            context: { environment: env.WORKERS_ENVIRONMENT, release: env.CF_VERSION_METADATA?.id ?? "unknown" } }),
        }),
        observe: (event) => {
          const expected = event.operation === "upload" && ["account_burst", "account_daily", "global_daily", "processing_exhausted"].includes(event.cause ?? "");
          const log = event.outcome === "failure" && !expected ? console.error : console.info;
          log(JSON.stringify({ event: "classifieds.photos.operation", service: "api-worker", environment: env.WORKERS_ENVIRONMENT,
            release: env.CF_VERSION_METADATA?.id ?? "unknown", ...context, ...event }));
        },
      });
    },
  };
}
