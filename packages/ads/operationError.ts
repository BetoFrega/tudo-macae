export class AdOperationError extends Error {
  constructor(readonly code: "conflict" | "forbidden" | "not-found", message: string) {
    super(message);
    this.name = "AdOperationError";
  }
}
