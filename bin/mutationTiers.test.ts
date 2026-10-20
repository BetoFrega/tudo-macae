// @vitest-environment node
import { describe, test, expect } from "vitest";
import {
  summarizeMutationTierRuns,
  unitMutationTierByName,
} from "./mutationTiers.ts";

describe("mutation tiers", () => {
  test("the agent harness runtimes and their direct tests share the pure tier", () => {
    expect(unitMutationTierByName.pure.mutate).toContain(
      "bin/agentHarnessChecker.mjs",
    );
    expect(unitMutationTierByName.pure.mutate).toContain(
      "bin/checkAgentHarnessCli.mjs",
    );
    expect(unitMutationTierByName.pure.tests).toContain(
      "bin/agentHarnessChecker*.test.ts",
    );
    expect(unitMutationTierByName.pure.tests).toContain(
      "bin/check-agent-harness.*.test.ts",
    );
  });
});

describe("summarizeMutationTierRuns", () => {
  test("returns zero when all tiers pass", () => {
    const summary = summarizeMutationTierRuns([
      { tierName: "pure", exitCode: 0, output: "pure" },
      { tierName: "component", exitCode: 0, output: "component" },
    ]);

    expect(summary.exitCode).toBe(0);
    expect(summary.orderedRuns.map(run => run.tierName)).toEqual([
      "pure",
      "component",
    ]);
  });

  test("returns non-zero when one tier fails", () => {
    const summary = summarizeMutationTierRuns([
      { tierName: "pure", exitCode: 1, output: "pure" },
      { tierName: "component", exitCode: 0, output: "component" },
    ]);

    expect(summary.exitCode).toBe(1);
  });

  test("returns non-zero when multiple tiers fail", () => {
    const summary = summarizeMutationTierRuns([
      { tierName: "pure", exitCode: 1, output: "pure" },
      { tierName: "component", exitCode: 2, output: "component" },
    ]);

    expect(summary.exitCode).toBe(1);
  });

  test("returns zero and empty logs for an empty run list", () => {
    const summary = summarizeMutationTierRuns([]);

    expect(summary.exitCode).toBe(0);
    expect(summary.orderedRuns).toEqual([]);
  });

  test("orders logs by declared tier order", () => {
    const summary = summarizeMutationTierRuns([
      { tierName: "component", exitCode: 0, output: "component log" },
      { tierName: "pure", exitCode: 0, output: "pure log" },
    ]);

    expect(summary.orderedRuns.map(run => run.output)).toEqual([
      "pure log",
      "component log",
    ]);
  });
});
