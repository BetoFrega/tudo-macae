export function readErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  return "error" in data && typeof data.error === "string" ? data.error : undefined;
}
