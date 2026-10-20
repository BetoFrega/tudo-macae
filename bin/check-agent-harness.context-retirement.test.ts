// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest";
import {
  createContextFixture,
  removeFixtureRoots,
  repositoryRoot,
  runHarness,
} from "./agentHarnessFixtures";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

afterEach(removeFixtureRoots);

describe("context paths: retirement", () => {
  test("rejects an active retired reference", async () => {
    const fixtureRoot = await createContextFixture(
      { "AGENTS.md": "Use old-workflow for every request.\n" },
      ["old-workflow"],
    );

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS.md:1 actively references retired context old-workflow",
    );
  });

  test("rejects active retired references in other repository-owned Markdown", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "CONTEXT-MAP.md": "Use old-workflow for every domain change.\n",
        "README.md": "Start every task with old-workflow.\n",
        "guides/workflow.md": "Follow old-workflow before publishing.\n",
      },
      ["old-workflow"],
    );

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "CONTEXT-MAP.md:1 actively references retired context old-workflow",
    );
    expect(result.stderr).toContain(
      "README.md:1 actively references retired context old-workflow",
    );
    expect(result.stderr).toContain(
      "guides/workflow.md:1 actively references retired context old-workflow",
    );
  });

  test.skipIf(inWorkers)("accepts a historical retired reference in other repository-owned Markdown", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "CONTEXT-MAP.md": "old-workflow once owned every domain change. <!-- context-reference: historical -->\n",
      },
      ["old-workflow"],
    );

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test.skipIf(inWorkers)("excludes upstream-locked skills from retirement validation", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "skills-lock.json": JSON.stringify({
          skills: {
            "locked-skill": {},
          },
        }),
        ".agents/skills/locked-skill/SKILL.md": "Use old-workflow for every request.\n",
      },
      ["old-workflow"],
    );

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test.skipIf(inWorkers)("does not validate pointers in Markdown newly covered for retirement", async () => {
    const fixtureRoot = await createContextFixture({
      "README.md": "Read [the missing guide](missing.md).\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test.skipIf(inWorkers)("accepts a retired reference marked as history", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "docs/research/history.md": "old-workflow once owned this task. <!-- context-reference: historical -->\n",
      },
      ["old-workflow"],
    );

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test("rejects a historical marker that does not end the line", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "AGENTS.md": "old-workflow history <!-- context-reference: historical --> is current again.\n",
      },
      ["old-workflow"],
    );

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS.md:1 actively references retired context old-workflow",
    );
  });
});
