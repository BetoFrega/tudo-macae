export class AdSitemapReadError extends Error {
  constructor(readonly errorClass: ReturnType<typeof classifyAdSitemapError>) {
    super("Ad sitemap read failed.");
    this.name = "AdSitemapReadError";
  }
}

type AdSitemapErrorClass = "invalid-data" | "permission-denied" | "unauthenticated" | "deadline-exceeded" | "unavailable" | "resource-exhausted" | "unknown";

// Firestore reports gRPC codes as numbers and the client SDK as names.
const errorClassByCode = new Map<unknown, AdSitemapErrorClass>([
  [7, "permission-denied"], ["permission-denied", "permission-denied"],
  [16, "unauthenticated"], ["unauthenticated", "unauthenticated"],
  [4, "deadline-exceeded"], ["deadline-exceeded", "deadline-exceeded"],
  [14, "unavailable"], ["unavailable", "unavailable"],
  [8, "resource-exhausted"], ["resource-exhausted", "resource-exhausted"],
]);

export function classifyAdSitemapError(error: unknown): AdSitemapErrorClass {
  if (error instanceof AdSitemapReadError) return error.errorClass;
  const details = typeof error === "object" && error !== null ? error : {};
  const name = "name" in details ? details.name : undefined;
  if (name === "ZodError" || name === "TypeError" || name === "SyntaxError") return "invalid-data";
  const code = "code" in details ? details.code : undefined;
  return errorClassByCode.get(code) ?? "unknown";
}
