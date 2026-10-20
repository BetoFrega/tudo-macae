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

describe("context paths: pointers", () => {
  test("reports a broken internal Markdown pointer", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the missing branch](missing.md).\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS.md points to missing internal destination missing.md",
    );
  });

  test("reports a declared context destination that is absent", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "For deployment work, read `docs/agents/deployment.md`.\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS.md declares missing context destination docs/agents/deployment.md",
    );
  });

  test("reports a declared destination missing from a loaded document", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the product sweep](docs/product/sweep.md).\n",
      "docs/product/sweep.md": "Open `docs/product/missing.md`.\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "docs/product/sweep.md declares missing context destination docs/product/missing.md",
    );
  });

  test("reports a declared destination missing from a loaded skill", async () => {
    const fixtureRoot = await createContextFixture({
      ".agents/skills/local/SKILL.md": "Complete `docs/product/missing.md` before work.\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      ".agents/skills/local/SKILL.md declares missing context destination docs/product/missing.md",
    );
  });

  test("reports a broken reference-style Markdown pointer", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the guide][guide].\n\n[guide]: missing.md\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS.md points to missing internal destination missing.md",
    );
  });

  test.skipIf(inWorkers)("accepts a valid inline pointer with a fragment", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the guide](docs/agents/guide.md#rules).\n",
      "docs/agents/guide.md": "# Rules\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test("reports a broken inline pointer with balanced parentheses", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the current guide](docs/agents/missing_(current).md).\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS.md points to missing internal destination docs/agents/missing_(current).md",
    );
  });

  test.skipIf(inWorkers)("accepts a declared basename under a directory", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Product facts live in `docs/product/`: `constraints.md`.\n",
      "docs/product/constraints.md": "# Constraints\n",
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });

  test.skipIf(inWorkers)("accepts documents of any size", async () => {
    const fixtureRoot = await createContextFixture({
      "docs/agents/large.md": `# Large\n\n${"Any length remains valid.\n".repeat(50_000)}`,
    });

    const result = await runHarness(repositoryRoot, fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent harness is consistent.");
  });
});
