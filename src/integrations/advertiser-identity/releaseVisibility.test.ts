import { expect, test, vi } from "vitest";
import { resolveReleaseVisibility } from "./releaseVisibility";

test.each([true, false, undefined, "true"])("only a boolean on decision exposes the release (%s)", async (decision) => {
  expect(await resolveReleaseVisibility(async () => decision, vi.fn())).toBe(decision === true);
});

test("an unavailable flag keeps the release hidden and reports a bounded failure", async () => {
  const report = vi.fn();
  expect(await resolveReleaseVisibility(async () => {
    throw new Error("provider failure");
  }, report)).toBe(false);
  expect(report).toHaveBeenCalledTimes(1);
});
