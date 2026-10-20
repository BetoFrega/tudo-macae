// @vitest-environment node
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkAgentHarness } from "./agentHarnessChecker.mjs";

import {
  createContextFixture,
  interceptReadFile,
  repositoryRoot,
  runChecker,
  removeFixtureRoots,
} from "./agentHarnessCheckerFixtures";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

afterEach(removeFixtureRoots);

describe("context paths: retired references", () => {
  test("rejects an active retired reference", async () => {
    const fixtureRoot = await createContextFixture(
      { "AGENTS.md": "Use old-workflow for every request.\n" },
      ["old-workflow"],
    );

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
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

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "CONTEXT-MAP.md:1 actively references retired context old-workflow",
    );
    expect(result.failures.join("\n")).toContain(
      "README.md:1 actively references retired context old-workflow",
    );
    expect(result.failures.join("\n")).toContain(
      "guides/workflow.md:1 actively references retired context old-workflow",
    );
  });

  test("continues retirement validation when an enumerated Markdown disappears", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "existing.md": "Use old-workflow for every request.\n",
        "vanishing.md": "No retired references here.\n",
      },
      ["old-workflow"],
    );
    const vanishingPath = path.join(fixtureRoot, "vanishing.md");

    const result = await checkAgentHarness({
      contextRoot: fixtureRoot,
      lockedSkillsRoot: repositoryRoot,
      repositoryRoot,
      readFile: interceptReadFile(async (filePath) => {
        if (filePath === vanishingPath) await rm(vanishingPath);
      }),
    });

    expect(result.failures).toContain(
      "existing.md:1 actively references retired context old-workflow",
    );
    await expect(readFile(vanishingPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("surfaces non-ENOENT errors while reading retirement Markdown", async () => {
    const fixtureRoot = await createContextFixture(
      { "unreadable.md": "No retired references here.\n" },
      ["old-workflow"],
    );
    const unreadablePath = path.join(fixtureRoot, "unreadable.md");
    const readError = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });

    await expect(checkAgentHarness({
      contextRoot: fixtureRoot,
      lockedSkillsRoot: repositoryRoot,
      repositoryRoot,
      readFile: interceptReadFile((filePath) => {
        if (filePath === unreadablePath) throw readError;
      }),
    })).rejects.toBe(readError);
  });

  test.skipIf(inWorkers)("accepts a historical retired reference in other repository-owned Markdown", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "CONTEXT-MAP.md": "old-workflow once owned every domain change. <!-- context-reference: historical -->\n",
      },
      ["old-workflow"],
    );

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
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

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });

  test.skipIf(inWorkers)("does not validate pointers in Markdown newly covered for retirement", async () => {
    const fixtureRoot = await createContextFixture({
      "README.md": "Read [the missing guide](missing.md).\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });

  test.skipIf(inWorkers)("accepts a retired reference marked as history", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "docs/research/history.md": "old-workflow once owned this task. <!-- context-reference: historical -->\n",
      },
      ["old-workflow"],
    );

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });

  test("rejects a historical marker that does not end the line", async () => {
    const fixtureRoot = await createContextFixture(
      {
        "AGENTS.md": "old-workflow history <!-- context-reference: historical --> is current again.\n",
      },
      ["old-workflow"],
    );

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "AGENTS.md:1 actively references retired context old-workflow",
    );
  });
});
