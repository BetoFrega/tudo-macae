import { expect, test } from "vitest";
import { evaluateFlagshipFlag } from "./flagshipEvaluation";

const binding = (result: { value: boolean; errorCode?: string } | Error) => ({
  getBooleanDetails: async () => {
    if (result instanceof Error) throw result;
    return result;
  },
});

test("serves the value Flagship resolved", async () => {
  await expect(evaluateFlagshipFlag(binding({ value: true }), "business-claim")).resolves.toBe(true);
  await expect(evaluateFlagshipFlag(binding({ value: false }), "business-claim")).resolves.toBe(false);
});

test.each([
  ["no binding", undefined, "configuration"],
  ["an unknown flag", binding({ value: false, errorCode: "FLAG_NOT_FOUND" }), "evaluation"],
  ["a failing binding", binding(new Error("timeout")), "network"],
] as const)("%s is reported as unavailable instead of served", async (_case, flags, category) => {
  await expect(evaluateFlagshipFlag(flags, "business-claim")).rejects.toMatchObject({ category });
});
