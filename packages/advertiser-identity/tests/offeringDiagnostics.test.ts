import { expect, test } from "vitest";
import { offeringFailureCause } from "../offeringDiagnostics";

test("classifies operational causes without returning private error content", () => {
  expect(offeringFailureCause({ code: 14, message: "Private payload" })).toBe("persistence_unavailable");
  expect(offeringFailureCause({ code: 6 })).toBe("audit_duplicate");
  expect(offeringFailureCause({ name: "ZodError", issues: [{ input: "Private" }] })).toBe("persisted_data_invalid");
  expect(offeringFailureCause({ code: "catalog_revalidation_failed" })).toBe("revalidation_failed");
  expect(offeringFailureCause(new Error("Private"))).toBe("unexpected_dependency_failure");
});
