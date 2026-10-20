export class EditorialOperationError extends Error {
  constructor(
    public readonly code:
      | "validationFailed"
      | "forbidden"
      | "notFound"
      | "revisionConflict"
      | "duplicate"
      | "humanActionRequired",
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "EditorialOperationError";
  }
}
