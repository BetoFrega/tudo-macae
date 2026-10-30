import { describe, expect, it } from "vitest";

import { classifyPullRequestDiff, DOCUMENTATION_FAST_PATH, FULL_TEST_PATH } from "./pullRequestDiff.mjs";

const fixedPoint = { baseSha: "a".repeat(40), headSha: "b".repeat(40), complete: true };

function classify(files: unknown) {
  return classifyPullRequestDiff({ ...fixedPoint, files });
}

describe("classifyPullRequestDiff", () => {
  it.each([
    { files: [{ filename: "docs/README.md", status: "added" }] },
    { files: [{ filename: "docs/agents/test-harness-operation.md", status: "modified" }] },
    { files: [{ filename: "docs/obsolete.md", status: "removed" }] },
    { files: [{ filename: "docs/old.md", previous_filename: "docs/new.md", status: "renamed" }] },
  ])("selects the documentation fast path for an eligible complete diff", ({ files }) => {
    expect(classify(files)).toMatchObject({ plan: DOCUMENTATION_FAST_PATH });
  });

  it.each([
    { files: [{ filename: "AGENTS.md", status: "modified" }] },
    { files: [{ filename: ".agents/skills/example/SKILL.md", status: "modified" }] },
    { files: [{ filename: ".github/workflows/vitest.yml", status: "modified" }] },
    { files: [{ filename: "pnpm-lock.yaml", status: "modified" }] },
    { files: [{ filename: "src/page.tsx", status: "modified" }] },
    { files: [{ filename: "docs/readme.MD", status: "modified" }] },
    { files: [{ filename: "docs/renamed.md", previous_filename: "src/page.tsx", status: "renamed" }] },
    { files: [{ filename: "docs/notes.md", status: "copied" }] },
    { files: [{ filename: "docs/notes.md", status: "modified", previous_filename: "docs/old.md" }] },
    { files: [{ filename: "docs/notes.md" }] },
    { files: [{ filename: "docs/../src/page.md", status: "modified" }] },
    { files: [{ filename: "docs/notes.md", status: "modified" }, { filename: "src/page.tsx", status: "modified" }] },
  ])("selects the full path for a non-eligible or ambiguous file", ({ files }) => {
    expect(classify(files)).toMatchObject({ plan: FULL_TEST_PATH });
  });

  it.each([
    undefined,
    { ...fixedPoint, complete: false, files: [{ filename: "docs/notes.md", status: "modified" }] },
    { ...fixedPoint, files: [] },
    { ...fixedPoint, baseSha: undefined, files: [{ filename: "docs/notes.md", status: "modified" }] },
  ])("selects the full path when the fixed point is incomplete or ambiguous", (snapshot) => {
    expect(classifyPullRequestDiff(snapshot)).toMatchObject({ plan: FULL_TEST_PATH });
  });
});
