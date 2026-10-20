import type * as entry from "../mediaCorrection";

export async function run(module: typeof entry) {
  const media = {
    id: "media-1",
    kind: "article-image" as const,
    status: "active" as const,
    revision: 1,
    storagePath: "media/image.webp",
    mimeType: "image/webp",
    alt: "Orla",
    caption: "",
    provenance: {
      origin: "own-production" as const,
      displayBasis: "own-production" as const,
      creator: "Equipe",
      credit: "Equipe",
      acquiredAt: 1,
    },
    createdAt: 1,
    updatedAt: 1,
  };
  const correction = module.createMediaCorrection({
    now: () => 2,
    fingerprint: value => JSON.stringify(value),
    transact: async (_caller, _input, decide) => decide({
      read: async () => ({ media }),
      revise: async input => ({
        status: "updated",
        media: { ...media, ...input.metadata, revision: 2, updatedAt: 2 },
      }),
      saveIdempotency: () => {},
      recordActivity: () => "activity-1",
    }),
  });
  await correction.correct({
    editorId: "editor-1",
    channel: "newsroom",
    origin: "manual",
  }, {
    mediaId: media.id,
    expectedRevision: 1,
    metadata: {
      alt: "Orla de Macaé",
      caption: media.caption,
      provenance: media.provenance,
    },
    reason: "Descrição mais precisa",
    idempotencyKey: "correction-1",
  });
}
