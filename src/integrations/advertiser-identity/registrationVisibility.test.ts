import { expect, test, vi } from "vitest";
import { resolveRegistrationVisibility } from "./registrationVisibility";

test.each([true, false, undefined, "true"])("only a boolean on decision promotes registration (%s)", async (decision) => {
  expect(await resolveRegistrationVisibility(async () => decision, vi.fn())).toBe(decision === true);
});

test("an unavailable flag keeps the current navigation and reports a bounded failure", async () => {
  const report = vi.fn();
  expect(await resolveRegistrationVisibility(async () => {
    throw new Error("provider failure");
  }, report)).toBe(false);
  expect(report).toHaveBeenCalledTimes(1);
});
