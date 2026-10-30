import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { expect } from "vitest";
import { parse } from "yaml";

export const workflowsDirectory = path.join(".github", "workflows");
export const actionsDirectory = path.join(".github", "actions");
export const expensiveWorkflowOperation = /(?:pnpm exec|npx) playwright test|run test:e2e/;

export type PullRequestTrigger = {
  types: string[];
};

export type WorkflowStep = {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
};

export type WorkflowJob = {
  "name"?: string;
  "if"?: string;
  "needs"?: string;
  "runs-on"?: string;
  "steps"?: WorkflowStep[];
  "timeout-minutes"?: number;
};

export type Workflow = {
  name: string;
  on: Record<string, unknown> & { pull_request?: PullRequestTrigger };
  concurrency?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
};

export type CompositeAction = {
  runs: {
    using: string;
    steps: WorkflowStep[];
  };
};

export const cheapWorkflows = [
  {
    file: "vitest.yml",
    job: "test",
    check: "Vitest Tests",
    events: ["opened", "reopened", "synchronize", "ready_for_review"],
  },
] as const;

export const draftVitestWorkflow = {
  file: "vitest-draft.yml",
  job: "test",
  check: "Vitest Tests (draft opt-in)",
  events: ["labeled"],
} as const;

export function workflow(file: string) {
  return parse(readFileSync(path.join(workflowsDirectory, file), "utf8")) as Workflow;
}

export function compositeAction(directory: string) {
  return parse(readFileSync(path.join(actionsDirectory, directory, "action.yml"), "utf8")) as CompositeAction;
}

export function workflowFiles() {
  return readdirSync(workflowsDirectory).filter(file => file.endsWith(".yml") || file.endsWith(".yaml"));
}

export function invokesExpensiveOperation(document: Workflow) {
  return Object.values(document.jobs)
    .flatMap(value => value.steps?.map(step => step.run ?? "") ?? [])
    .some(command => expensiveWorkflowOperation.test(command));
}

export function pullRequestTrigger(file: string) {
  const trigger = workflow(file).on.pull_request;
  expect(trigger, `${file} must have a pull_request trigger`).toBeDefined();
  return trigger!;
}

export function job(file: string, name: string) {
  const value = workflow(file).jobs[name];
  expect(value, `${file} must have job ${name}`).toBeDefined();
  return value;
}

export function evaluatePullRequestCondition(
  condition: string,
  pullRequest: { draft: boolean; labels: string[]; label?: string; user?: string },
) {
  const expression = condition
    .replaceAll("always()", "true")
    .replaceAll("needs.typecheck.result", JSON.stringify("success"))
    .replace(
      /contains\(github\.event\.pull_request\.labels\.\*\.name,\s*'([^']+)'\)/g,
      (_, label: string) => String(pullRequest.labels.includes(label)),
    )
    .replaceAll("github.event.pull_request.draft", String(pullRequest.draft))
    .replaceAll("github.event.label.name", JSON.stringify(pullRequest.label ?? ""))
    .replaceAll("github.event.pull_request.user.login", JSON.stringify(pullRequest.user ?? "contributor"));

  expect(expression).not.toMatch(/\b(?:contains|github)\b/);
  const result: unknown = runInNewContext(expression, Object.create(null), { timeout: 100 });
  expect(result).toEqual(expect.any(Boolean));
  return result as boolean;
}

export function cheapCondition(file: string, jobName: string) {
  const condition = job(file, jobName).if;
  expect(condition, `${file} must guard its cheap check`).toBeDefined();
  return condition!;
}

export function vitestRunner(file: string) {
  const value = job(file, "test")["runs-on"];
  expect(value, `${file} must select a runner`).toBeDefined();
  return value!;
}

export function runsForPullRequestEvent(
  file: string,
  jobName: string,
  event: string,
  pullRequest: { draft: boolean; labels: string[]; label?: string },
) {
  return pullRequestTrigger(file).types.includes(event)
    && evaluatePullRequestCondition(cheapCondition(file, jobName), pullRequest);
}
