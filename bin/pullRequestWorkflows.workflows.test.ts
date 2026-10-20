import { describe, expect, it } from "vitest";

import {
  compositeAction,
  invokesExpensiveOperation,
  job,
  vitestRunner,
  workflowFiles,
  workflow,
  type Workflow,
} from "./pullRequestWorkflows.support";

describe("expensive workflows", () => {
  it("removes the legacy Playwright workflow without replacing it in this slice", () => {
    expect(workflowFiles()).not.toContain("playwright.yml");
  });

  it.each(["npx playwright test", "npm run test:e2e"])("recognizes the Playwright command %s without changing a real workflow", (command) => {
    const fixture: Workflow = {
      name: "Pull request fixture",
      on: { pull_request: { types: ["synchronize"] } },
      jobs: { test: { steps: [{ run: command }] } },
    };

    expect(invokesExpensiveOperation(fixture)).toBe(true);
  });

  it("keeps expensive delivery checks out of pull requests", () => {
    for (const file of workflowFiles()) {
      const document = workflow(file);
      if (!invokesExpensiveOperation(document)) continue;

      expect(document.on, file).not.toHaveProperty("pull_request");
      expect(document.on, file).not.toHaveProperty("pull_request_target");
    }
  });
});

describe("Vitest runner routing", () => {
  const vitestWorkflows = ["vitest.yml", "vitest-draft.yml"];

  it("runs both entry points on the free GitHub-hosted runner of a public repository", () => {
    for (const file of vitestWorkflows) expect(vitestRunner(file), file).toBe("ubuntu-latest");
  });

  it("keeps both jobs at 30 minutes and delegates the same complete collection", () => {
    for (const file of vitestWorkflows) {
      const test = job(file, "test");
      expect(test["timeout-minutes"], file).toBe(30);
      expect(test.steps?.filter(step => step.uses === "./.github/actions/run-vitest"), file).toHaveLength(1);
      expect(test.steps?.[0].uses, file).toBe("actions/checkout@v5");
    }

    const action = compositeAction("run-vitest");
    expect(action.runs.using).toBe("composite");
    expect(action.runs.steps.map(step => step.uses ?? step.run)).toEqual([
      "actions/setup-node@v5",
      "npm ci",
      "npm test -- --tier=integration --bail=1",
      "actions/upload-artifact@v6",
    ]);
    expect(action.runs.steps.at(-1)).toMatchObject({
      if: "always()",
      with: {
        "path": "test-results/vitest-logs/",
        "if-no-files-found": "error",
      },
    });
  });
});
