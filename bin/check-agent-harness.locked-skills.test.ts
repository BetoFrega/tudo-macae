// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest";
import { runAgentHarnessCli } from "./checkAgentHarnessCli.mjs";
import {
  alteredHash,
  createLockedSkillFixture,
  expectedHash,
  removeFixtureRoots,
  repositoryRoot,
  runHarness,
} from "./agentHarnessFixtures";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

afterEach(removeFixtureRoots);

describe("locked skill integrity", () => {
  test("preserves option diagnostics and their ordering", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const status = await runAgentHarnessCli({
      commandArguments: ["--locked-skills-root", "--context-root"],
      checkArtifacts: async () => [],
      checkHarness: async () => ({ failures: [], ok: true }),
      repositoryRoot,
      writeStderr: value => stderr.push(value),
      writeStdout: value => stdout.push(value),
    });

    expect(status).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain(
      "- --locked-skills-root requires a path\n"
      + "- --context-root requires a path\n",
    );
  });

  test.skipIf(inWorkers)("accepts a skill directory matching its npx skills hash", async () => {
    const fixtureRoot = await createLockedSkillFixture("# Locked skill\n");

    const result = await runHarness(fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test("reports the expected and obtained hashes for an altered skill", async () => {
    const fixtureRoot = await createLockedSkillFixture("# Altered skill\n");

    const result = await runHarness(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("locked-skill");
    expect(result.stderr).toContain(`expected ${expectedHash}`);
    expect(result.stderr).toContain(`obtained ${alteredHash}`);
  });

  test("reports the expected hash and a missing obtained value", async () => {
    const fixtureRoot = await createLockedSkillFixture();

    const result = await runHarness(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("locked-skill");
    expect(result.stderr).toContain(`expected ${expectedHash}`);
    expect(result.stderr).toContain("obtained <missing>");
  });
});
