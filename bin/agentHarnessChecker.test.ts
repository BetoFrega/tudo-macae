// @vitest-environment node
import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkAgentHarness } from "./agentHarnessChecker.mjs";
import { REMOVED_SCRIPTS, expectedScriptNames } from "./scripts-help.mjs";
import {
  createRepositoryFixture,
  run,
  removeFixtureRoots,
} from "./agentHarnessCheckerFixtures";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

afterEach(removeFixtureRoots);

describe("e2e supervisor output", () => {
  test.skipIf(inWorkers)("rejects a Playwright web server without piped stdout", async () => {
    const fixtureRoot = await createRepositoryFixture();
    await writeFile(
      path.join(fixtureRoot, "tests/e2e/playwright.config.ts"),
      "webServer: {\n  command: \"node tests/e2e/bin/e2e-stack.mjs\",\n  },\n",
    );

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      "tests/e2e/playwright.config.ts must set webServer.stdout to \"pipe\" so build and server output reaches Playwright",
    );
  });

  test.skipIf(inWorkers)("rejects a Playwright web server that ignores stdout", async () => {
    const fixtureRoot = await createRepositoryFixture();
    await writeFile(
      path.join(fixtureRoot, "tests/e2e/playwright.config.ts"),
      "webServer: {\n  command: \"node tests/e2e/bin/e2e-stack.mjs\",\n    stdout: \"ignore\",\n  },\n// stdout: \"pipe\"\n",
    );

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      "tests/e2e/playwright.config.ts must set webServer.stdout to \"pipe\" so build and server output reaches Playwright",
    );
  });
});

describe("repository integrity", () => {
  test.skipIf(inWorkers)("accepts a complete minimal harness repository", async () => {
    const fixtureRoot = await createRepositoryFixture();

    await expect(checkAgentHarness({
      repositoryRoot: fixtureRoot,
    })).resolves.toEqual({ failures: [], ok: true });
  });

  test.skipIf(inWorkers)("rejects the retired .agent layout", async () => {
    const fixtureRoot = await createRepositoryFixture();
    await mkdir(path.join(fixtureRoot, ".agent"));

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.failures).toContain("legacy .agent directory must not exist");
  });

  test.skipIf(inWorkers)("rejects a local skill without frontmatter", async () => {
    const fixtureRoot = await createRepositoryFixture();
    const skillDirectory = path.join(fixtureRoot, ".agents", "skills", "local");
    await mkdir(skillDirectory);
    await writeFile(path.join(skillDirectory, "SKILL.md"), "# Local\n");
    await symlink(
      path.join("..", "..", ".agents", "skills", "local"),
      path.join(fixtureRoot, ".claude", "skills", "local"),
    );

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.failures).toContain(
      ".agents/skills/local/SKILL.md has no frontmatter",
    );
  });

  test.skipIf(inWorkers)("rejects a hook configuration that bypasses shared hooks", async () => {
    const fixtureRoot = await createRepositoryFixture();
    await writeFile(
      path.join(fixtureRoot, ".codex", "hooks.json"),
      JSON.stringify({ hooks: [{ command: "node private-hook.mjs" }] }),
    );

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.failures).toContain(
      ".codex/hooks.json bypasses the shared hooks: node private-hook.mjs",
    );
  });

  test.skipIf(inWorkers)("reports a script listed by help but absent from package scripts", async () => {
    const fixtureRoot = await createRepositoryFixture();
    const [missingScript, ...remainingScripts] = expectedScriptNames();
    await writeFile(
      path.join(fixtureRoot, "package.json"),
      JSON.stringify({
        scripts: Object.fromEntries(remainingScripts.map(name => [name, "true"])),
      }),
    );

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.failures).toContain(
      `bin/scripts-help.mjs lists ${missingScript}, which package.json does not declare`,
    );
  });

  test.skipIf(inWorkers)("reports a removed script cited by a tracked file", async () => {
    const fixtureRoot = await createRepositoryFixture();
    const [removedScript] = REMOVED_SCRIPTS;
    await writeFile(
      path.join(fixtureRoot, "README.md"),
      `Run ${removedScript} before every change.\n`,
    );
    await run("git", ["add", "README.md"], { cwd: fixtureRoot });

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.failures).toContain(
      `cites a script that no longer exists — README.md:1:Run ${removedScript} before every change.`,
    );
  });

  test.skipIf(inWorkers)("rejects malformed context retirement data", async () => {
    const fixtureRoot = await createRepositoryFixture();
    await writeFile(
      path.join(fixtureRoot, ".agents", "context-retirements.json"),
      JSON.stringify({ retiredReferences: [""] }),
    );

    const result = await checkAgentHarness({ repositoryRoot: fixtureRoot });

    expect(result.failures).toContain(
      ".agents/context-retirements.json is invalid: retiredReferences must be an array of non-empty strings",
    );
  });
});
