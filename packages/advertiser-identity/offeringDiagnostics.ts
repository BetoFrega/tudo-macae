type OfferingFailureCause = "persistence_unavailable" | "audit_duplicate" | "revalidation_failed" | "persisted_data_invalid" | "unexpected_dependency_failure";

function errorField(error: unknown, field: "code" | "name"): unknown {
  if (!error || typeof error !== "object" || !(field in error)) return undefined;
  return (error as Record<typeof field, unknown>)[field];
}

function codeCause(code: unknown): OfferingFailureCause | undefined {
  if (typeof code !== "number" && typeof code !== "string") return undefined;
  if ([4, 14, "deadline-exceeded", "unavailable"].includes(code)) return "persistence_unavailable";
  if ([6, "already-exists"].includes(code)) return "audit_duplicate";
  if (code === "catalog_revalidation_failed") return "revalidation_failed";
  return undefined;
}

export function offeringFailureCause(error: unknown): OfferingFailureCause {
  const cause = codeCause(errorField(error, "code"));
  if (cause) return cause;
  if (errorField(error, "name") === "ZodError") return "persisted_data_invalid";
  return "unexpected_dependency_failure";
}
