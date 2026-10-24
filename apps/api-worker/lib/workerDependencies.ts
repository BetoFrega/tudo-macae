import type { JWTVerifyGetKey } from "jose";
import type { createAuthenticationDiagnostics, AuthenticationDiagnosticEvent } from "@tudomacae/authentication/diagnostics";
import type { ClassifiedsPhotos, ClassifiedsPhotoRenderer } from "./classifiedsPhotoHttp";
import type { CatalogFlagDecision } from "@tudomacae/advertiser-identity/offeringCatalog";
import type { HumanChallengeUnavailable, HumanChallengeVerifier } from "./humanChallenge";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import type { EditorialMediaService } from "./mediaHttp";
import type { EditorialImagePurge } from "@tudomacae/public-image-delivery/editorialPurge";
import type { createSupplySnapshotExport } from "@tudomacae/advertiser-identity/supplySnapshot";

export type AuthenticationMail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};
export type WorkerDependencies = {
  diagnostics?: ReturnType<typeof createAuthenticationDiagnostics>;
  writeDiagnostic?: (event: AuthenticationDiagnosticEvent) => void;
  sampleDiagnosticSuccess?: () => boolean;
  serviceKeys?: JWTVerifyGetKey;
  /** Set only by the `WebRenderer` entrypoint: a service binding already proves the caller is the web Worker. */
  boundRenderer?: boolean;
  classifiedsQualification?: () => Promise<boolean>;
  /** Absent closes Classifieds procedures; the composition root reads CLASSIFIEDS_DB. */
  classifiedsPersistence?: (env: Env) => ClassifiedsPersistence;
  classifiedsPhotos?: (env: Env, context?: { requestId?: string; sweepOperationId?: string }) => ClassifiedsPhotos;
  classifiedsPhotoRenderer?: (env: Env) => ClassifiedsPhotoRenderer;
  classifiedsOfferingFlag?: (env: Env) => (id: string) => Promise<CatalogFlagDecision>;
  classifiedsPhotoUrl?: (path: string) => string;
  /** Absent while the Worker has no PDM_EXPORTS bucket; the daily supply snapshot then never runs. */
  classifiedsSupplySnapshot?: (env: Env) => ReturnType<typeof createSupplySnapshotExport> | undefined;
  /** Absent while the Worker has no EDITORIAL_DB; Media routes then answer 404. */
  editorialMedia?: (env: Env) => EditorialMediaService | undefined;
  /** Purges retired editorial images; absent keeps them pending, so Blog saves that retire Media stay `unconfirmed`. */
  editorialImagePurge?: (env: Env) => EditorialImagePurge;
  /** Deletes expired sessions and codes; absent leaves them in AUTHENTICATION_DB. */
  expireAuthentication?: (env: Env, now: number) => Promise<void>;
  reportClassifiedsFailure?: (error: unknown, operation?: string) => void;
  /** Names the multiplexed Media operation, and its ingestion intent when known, of an internal failure. */
  reportMediaFailure?: (operation?: string, operationId?: string) => void;
  /** Names the multiplexed Blog operation of an internal failure, and the caller's mutation correlation when it sent one. */
  reportBlogFailure?: (operation?: string, correlationId?: string) => void;
  /** Names the stage of a public editorial image read that failed. */
  reportEditorialImageFailure?: (stage: string) => void;
  sendMail?: (mail: AuthenticationMail, env: Env) => Promise<void>;
  /** Absent refuses challenged authentication while Turnstile is enforced. */
  verifyHumanChallenge?: HumanChallengeVerifier;
  reportHumanChallengeUnavailable?: (category: HumanChallengeUnavailable, status?: number) => void;
};
