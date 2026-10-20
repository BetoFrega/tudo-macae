import {
  correctMediaMetadataSchema,
  type CorrectMediaMetadataInput,
} from "./mediaCorrectionPolicy";
import type { Media, MediaMetadata } from "@tudomacae/media/model";

export interface MediaCorrectionCaller {
  editorId: string;
  editorialClientId?: string;
  channel: "mcp" | "newsroom";
  origin?: "manual";
}

export interface MediaCorrectionReceipt {
  operation: "media.correctionApplied";
  fingerprint: string;
  correlationId: string;
  media: Media;
}

export interface MediaCorrectionTransaction {
  read(): Promise<{ media: Media | null; previous?: MediaCorrectionReceipt }>;
  revise(input: {
    id: string;
    expectedRevision: number;
    metadata: MediaMetadata;
    actorId: string;
  }): Promise<
    | { status: "updated"; media: Media }
    | { status: "not-found" }
    | { status: "conflict"; currentRevision: number }
  >;
  saveIdempotency(receipt: MediaCorrectionReceipt): void;
  recordActivity(
    operation: "media.correctionApplied",
    targetId: string,
    at: number,
    reason: string,
  ): string;
}

export interface MediaCorrectionDependencies {
  now(): number;
  fingerprint(value: unknown): string;
  transact<T>(
    caller: MediaCorrectionCaller,
    input: CorrectMediaMetadataInput,
    decide: (transaction: MediaCorrectionTransaction) => Promise<T>,
  ): Promise<T>;
}

export type CorrectMediaMetadataResult
  = | { status: "updated"; media: Media; correlationId: string }
    | { status: "replayed"; media: Media; correlationId: string }
    | { status: "not-found" }
    | { status: "conflict"; code: "revision_conflict"; currentRevision: number }
    | { status: "conflict"; code: "idempotency_conflict" };

export function createMediaCorrection(dependencies: MediaCorrectionDependencies) {
  return {
    async correct(
      caller: MediaCorrectionCaller,
      raw: CorrectMediaMetadataInput,
    ): Promise<CorrectMediaMetadataResult> {
      const input = correctMediaMetadataSchema.parse(raw);
      const fingerprint = dependencies.fingerprint({ caller, input });
      return dependencies.transact(caller, input, async (transaction) => {
        const state = await transaction.read();
        if (state.previous) {
          if (state.previous.operation !== "media.correctionApplied"
            || state.previous.fingerprint !== fingerprint) {
            return { status: "conflict", code: "idempotency_conflict" };
          }
          return {
            status: "replayed",
            media: state.previous.media,
            correlationId: state.previous.correlationId,
          };
        }
        if (!state.media) return { status: "not-found" };
        const revised = await transaction.revise({
          id: input.mediaId,
          expectedRevision: input.expectedRevision,
          metadata: { kind: "article-image", ...input.metadata },
          actorId: caller.editorId,
        });
        if (revised.status === "not-found") return revised;
        if (revised.status === "conflict") {
          return {
            status: "conflict",
            code: "revision_conflict",
            currentRevision: revised.currentRevision,
          };
        }
        const at = dependencies.now();
        const correlationId = transaction.recordActivity(
          "media.correctionApplied",
          input.mediaId,
          at,
          input.reason,
        );
        if (input.idempotencyKey) {
          transaction.saveIdempotency({
            operation: "media.correctionApplied",
            fingerprint,
            correlationId,
            media: revised.media,
          });
        }
        return {
          status: "updated",
          media: revised.media,
          correlationId,
        };
      });
    },
  };
}
