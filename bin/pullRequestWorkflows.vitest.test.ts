import { describe, expect, it } from "vitest";

import {
  cheapWorkflows,
  draftVitestWorkflow,
  job,
  pullRequestTrigger,
  runsForPullRequestEvent,
  workflow,
} from "./pullRequestWorkflows.support";

// These tests evaluate workflow conditions with node:vm, which the Workers runtime
// (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

describe("Vitest diff selection", () => {
  const vitestSteps = () => job("vitest.yml", "test").steps ?? [];

  it("classifies the complete fixed point before conditionally setting up the full suite", () => {
    const document = workflow("vitest.yml");
    const steps = vitestSteps();
    const classifier = steps.find(step => step.id === "diff");
    const script = classifier?.with?.script;

    expect(document.permissions).toEqual({ "contents": "read", "pull-requests": "read" });
    expect(classifier).toMatchObject({ uses: "actions/github-script@v8" });
    expect(script).toContain("github.paginate(github.rest.pulls.listFiles");
    expect(script).toContain("await readFixedPoint()");
    expect(script).toContain("files.length < 3000");
    expect(script).toContain("catch (error)");
    expect(script).toContain("core.setOutput(\"plan\", FULL_TEST_PATH)");
  });

  it("keeps documentation-only diffs successful without the expensive setup", () => {
    const steps = vitestSteps();
    expect(steps.find(step => step.name === "Documentation-only fast path")?.if).toBe("steps.diff.outputs.plan == 'documentation-fast-path'");

    expect(steps.find(step => step.uses === "./.github/actions/run-vitest")?.if).toBe("steps.diff.outputs.plan == 'full-test-path'");
  });

  it("does not use path filters to omit the required check", () => {
    expect(workflow("vitest.yml").on.pull_request).not.toHaveProperty("paths");
    expect(workflow("vitest.yml").on.pull_request).not.toHaveProperty("paths-ignore");
  });
});

describe("Vitest pull request checks", () => {
  const requiredVitestWorkflow = cheapWorkflows.find(({ file }) => file === "vitest.yml")!;

  it("keeps the required check name, origin, state-changing triggers and per-reference concurrency", () => {
    expect(job(requiredVitestWorkflow.file, requiredVitestWorkflow.job).name).toBe(requiredVitestWorkflow.check);
    expect(pullRequestTrigger(requiredVitestWorkflow.file).types).toEqual(requiredVitestWorkflow.events);
    expect(workflow(requiredVitestWorkflow.file).concurrency).toEqual({
      "group": "${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    });
  });

  it("keeps draft opt-in separate and limited to a newly added run-ci label", () => {
    expect(job(draftVitestWorkflow.file, draftVitestWorkflow.job).name).toBe(draftVitestWorkflow.check);
    expect(pullRequestTrigger(draftVitestWorkflow.file).types).toEqual(draftVitestWorkflow.events);
    expect(workflow(draftVitestWorkflow.file).concurrency).toEqual({
      "group": "${{ github.workflow }}-${{ github.ref }}-${{ github.event.label.name }}",
      "cancel-in-progress": true,
    });
  });

  it("prevents an unrelated label event from cancelling an active draft opt-in", () => {
    const group = String(workflow(draftVitestWorkflow.file).concurrency?.group);
    const forLabel = (label: string) => group.replace("${{ github.event.label.name }}", label);

    expect(forLabel("run-ci")).not.toBe(forLabel("needs-triage"));
  });

  it.skipIf(inWorkers).each([
    {
      name: "adds run-ci to a draft",
      event: "labeled",
      pullRequest: { draft: true, labels: ["run-ci"], label: "run-ci" },
      required: false,
      draftOptIn: true,
    },
    {
      name: "adds an unrelated label before run-ci to a draft",
      event: "labeled",
      pullRequest: { draft: true, labels: ["triage"], label: "triage" },
      required: false,
      draftOptIn: false,
    },
    {
      name: "adds an unrelated label after run-ci to a draft",
      event: "labeled",
      pullRequest: { draft: true, labels: ["run-ci", "triage"], label: "triage" },
      required: false,
      draftOptIn: false,
    },
    {
      name: "adds a triage label to a ready pull request",
      event: "labeled",
      pullRequest: { draft: false, labels: ["triage"], label: "triage" },
      required: false,
      draftOptIn: false,
    },
    {
      name: "removes run-ci from a draft",
      event: "unlabeled",
      pullRequest: { draft: true, labels: [], label: "run-ci" },
      required: false,
      draftOptIn: false,
    },
    {
      name: "removes another label from a draft that still has run-ci",
      event: "unlabeled",
      pullRequest: { draft: true, labels: ["run-ci"], label: "triage" },
      required: false,
      draftOptIn: false,
    },
    {
      name: "marks a pull request ready for review",
      event: "ready_for_review",
      pullRequest: { draft: false, labels: ["run-ci"] },
      required: true,
      draftOptIn: false,
    },
    {
      name: "synchronizes the latest SHA of a ready pull request",
      event: "synchronize",
      pullRequest: { draft: false, labels: [] },
      required: true,
      draftOptIn: false,
    },
  ])("$name only runs the intended Vitest check", ({ event, pullRequest, required, draftOptIn }) => {
    expect(runsForPullRequestEvent(requiredVitestWorkflow.file, requiredVitestWorkflow.job, event, pullRequest)).toBe(required);
    expect(runsForPullRequestEvent(draftVitestWorkflow.file, draftVitestWorkflow.job, event, pullRequest)).toBe(draftOptIn);
  });
});
