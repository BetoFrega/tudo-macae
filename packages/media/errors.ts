export class MediaNotFoundError extends Error {
  constructor() {
    super("A Mídia informada não existe.");
    this.name = "MediaNotFoundError";
  }
}

export class MediaRevisionConflictError extends Error {
  constructor(public readonly currentRevision: number) {
    super("A Mídia mudou desde a revisão esperada.");
    this.name = "MediaRevisionConflictError";
  }
}
