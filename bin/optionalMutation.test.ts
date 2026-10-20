// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";

it("keeps Stryker out of all automatic workflows and conventional commands", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith("test:mutation")) expect(command).not.toMatch(/stryker|mutation/i);
  }
  for (const file of readdirSync(".github/workflows")) {
    const source = readFileSync(`.github/workflows/${file}`, "utf8");
    if (!/stryker|test:mutation/.test(source)) continue;
    const workflow = parse(source);
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(source).not.toMatch(/thresholds\.break|mutation-regression/);
  }
});

it("makes the conventional command use the canonical unit and integration collection", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  expect(scripts.test).toBe("node bin/vitest-collection.mjs");
  const workflow = parse(readFileSync(".github/workflows/vitest.yml", "utf8"));
  const action = parse(readFileSync(".github/actions/run-vitest/action.yml", "utf8"));
  const runs = [...workflow.jobs.test.steps, ...action.runs.steps]
    .flatMap((step: { run?: string }) => step.run ? [step.run] : []);
  // quality-flare's Container tests run the unit tier (vitest.unit.config.mts).
  expect(runs).toEqual(expect.arrayContaining([
    "npm test -- --tier=integration --bail=1",
  ]));
  expect(runs.join("\n")).not.toMatch(/vitest run|stryker|test:mutation|--tier=unit/);
});
