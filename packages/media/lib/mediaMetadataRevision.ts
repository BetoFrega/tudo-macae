import { MediaNotFoundError, MediaRevisionConflictError } from "../errors";
import type { MediaMetadataRevisionDependencies, MediaRevisionTransaction, MediaRevisionResult } from "../metadataRevision";
import { updateMediaMetadataSchema, type UpdateMediaMetadataInput } from "../model";

export function buildMediaMetadataRevision({ now, store }: MediaMetadataRevisionDependencies) {
  async function revise(transaction: MediaRevisionTransaction, input: UpdateMediaMetadataInput): Promise<MediaRevisionResult> {
    const current = await transaction.read(input.id);
    if (!current) return { status: "not-found" };
    if (current.revision !== input.expectedRevision) return { status: "conflict", currentRevision: current.revision };
    const timestamp = now();
    const { id: _id, status: _status, revision, storagePath: _path, mimeType: _type,
      createdAt: _created, updatedAt: _updated, digest: _digest, ...metadata } = current;
    transaction.archive({ mediaId: current.id, revision, metadata, replacedAt: timestamp, replacedBy: input.actorId });
    transaction.update(input.id, { metadata: input.metadata, revision: revision + 1, updatedAt: timestamp });
    return {
      status: "updated",
      media: {
        ...current,
        ...input.metadata,
        revision: revision + 1,
        updatedAt: timestamp,
      },
    };
  }
  return {
    async update(raw: UpdateMediaMetadataInput) {
      const input = updateMediaMetadataSchema.parse(raw);
      const result = await store.transact(transaction => revise(transaction, input));
      if (result.status === "not-found") throw new MediaNotFoundError();
      if (result.status === "conflict") throw new MediaRevisionConflictError(result.currentRevision);
    },
    async coordinate(transaction: MediaRevisionTransaction, input: UpdateMediaMetadataInput) {
      return revise(transaction, updateMediaMetadataSchema.parse(input));
    },
  };
}
