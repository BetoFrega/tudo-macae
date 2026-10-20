import { describe, expect, it } from "vitest";

import {
  cheapCondition,
  cheapWorkflows,
  evaluatePullRequestCondition,
  job,
  pullRequestTrigger,
} from "./pullRequestWorkflows.support";

// These tests evaluate workflow conditions with node:vm, which the Workers runtime
// (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

describe("pull request checks", () => {
  it.each(cheapWorkflows)("keeps the $check name and the state-changing trigger set", ({ file, job: jobName, check, events }) => {
    expect(job(file, jobName).name).toBe(check);
    expect(pullRequestTrigger(file).types).toEqual(events);
  });

  it.skipIf(inWorkers).each([
    { name: "a draft without run-ci", draft: true, labels: [], expected: false },
    { name: "a ready pull request", draft: false, labels: [], expected: true },
  ])("evaluates cheap checks for $name", ({ draft, labels, expected }) => {
    for (const { file, job: jobName } of cheapWorkflows) {
      expect(evaluatePullRequestCondition(cheapCondition(file, jobName), { draft, labels }), file).toBe(expected);
    }
  });

  it.skipIf(inWorkers).each(cheapWorkflows)(
    "silences $check after run-ci is removed from a draft",
    ({ file, job: jobName }) => {
      expect(pullRequestTrigger(file).types).not.toContain("unlabeled");
      expect(evaluatePullRequestCondition(cheapCondition(file, jobName), { draft: true, labels: [] })).toBe(false);
    },
  );
});
