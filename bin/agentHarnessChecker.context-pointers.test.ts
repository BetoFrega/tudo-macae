// @vitest-environment node

import { afterEach, describe, expect, test } from "vitest";

import {
  createContextFixture,
  repositoryRoot,
  runChecker,
  removeFixtureRoots,
} from "./agentHarnessCheckerFixtures";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

afterEach(removeFixtureRoots);

describe("context paths: pointers", () => {
  test.skipIf(inWorkers).each([
    "<!-- [Unused](missing.md) -->",
    "~~~markdown\n[Unused](missing.md)\n~~~",
    "    [Unused](missing.md)",
    "\t[Unused](missing.md)",
    "Unused](missing.md)",
    "\\[Unused](missing.md)",
    "`[Unused](missing.md)`",
  ])("ignores non-navigable Markdown examples: %s", async (contents) => {
    const fixtureRoot = await createContextFixture({ "AGENTS.md": contents });
    expect(await runChecker(repositoryRoot, fixtureRoot)).toEqual({ failures: [], ok: true });
  });

  test("reports a broken angle-bracket Markdown pointer", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the missing guide]( <missing.md>).\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "AGENTS.md points to missing internal destination missing.md",
    );
  });

  test.skipIf(inWorkers)("ignores URL, root-relative and fragment Markdown targets", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": [
        "Read [the website](https://example.com/guide).",
        "Open [the app route](/redacao).",
        "See [this section](#rules).",
        "",
      ].join("\n"),
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });

  test("reports a broken internal Markdown pointer", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the missing branch](missing.md).\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "AGENTS.md points to missing internal destination missing.md",
    );
  });

  test("reports a relocated ADR whose capability contract is absent", async () => {
    const fixtureRoot = await createContextFixture({
      "docs/adr/0031-moderation.md": [
        "---", "record: pointer", "id: \"0031\"", "status: transferred",
        "decided: 2026-09-28", "---", "", "# 31. Moderation", "",
        "[Canonical contract](../product/content-moderation.md)", "",
      ].join("\n"),
    });
    const result = await runChecker(repositoryRoot, fixtureRoot);
    expect(result.failures.join("\n")).toContain(
      "docs/adr/0031-moderation.md points to missing internal destination ../product/content-moderation.md",
    );
  });

  test("validates navigable links in indented nested lists", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "- Rules\n    - [Missing guide](missing.md)\n",
    });
    const result = await runChecker(repositoryRoot, fixtureRoot);
    expect(result.failures.join("\n")).toContain(
      "AGENTS.md points to missing internal destination missing.md",
    );
  });

  test("the integrated harness enforces ADR discovery and canonical routing", async () => {
    const pointer = (id: string, target: string) => [
      "---", "record: pointer", `id: \"${id}\"`, "status: transferred",
      "decided: 2026-09-28", "---", "", `# ${Number(id)}. Relocated rule`, "",
      `[Destination](${target})`, "",
    ].join("\n");
    const fixtureRoot = await createContextFixture({
      "docs/adr/README.md": "[First](0031-first.md)\n",
      "docs/adr/0031-first.md": pointer("0031", "0032-second.md"),
      "docs/adr/0032-second.md": pointer("0032", "0031-first.md"),
    });
    const result = await runChecker(repositoryRoot, fixtureRoot);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("docs/adr/README.md must link to 0032-second.md");
    expect(result.failures.filter(failure => failure.includes("non-pointer destination")))
      .toHaveLength(2);
  });

  test("reports a declared context destination that is absent", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "For deployment work, read `docs/agents/deployment.md`.\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "AGENTS.md declares missing context destination docs/agents/deployment.md",
    );
  });

  test("reports a declared destination missing from a loaded document", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the product sweep](docs/product/sweep.md).\n",
      "docs/product/sweep.md": "Open `docs/product/missing.md`.\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "docs/product/sweep.md declares missing context destination docs/product/missing.md",
    );
  });

  test("reports a declared destination missing from a loaded skill", async () => {
    const fixtureRoot = await createContextFixture({
      ".agents/skills/local/SKILL.md": "Complete `docs/product/missing.md` before work.\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      ".agents/skills/local/SKILL.md declares missing context destination docs/product/missing.md",
    );
  });

  test.skipIf(inWorkers)("reports a missing destination once across references and inline links", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the guide][guide], reuse [guide][], [a section](missing.md#rules), [an alias](./missing.md?mode=read), or [another alias](a/../missing.md).\n\n[guide]: missing.md\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      "AGENTS.md points to missing internal destination missing.md",
    ]);
  });

  test.skipIf(inWorkers)("accepts a valid inline pointer with a fragment", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the guide](docs/agents/guide.md#rules).\n",
      "docs/agents/guide.md": "# Rules\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });

  test("reports a broken inline pointer with balanced parentheses", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Load [the current guide](docs/agents/missing_(current).md).\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "AGENTS.md points to missing internal destination docs/agents/missing_(current).md",
    );
  });

  test.skipIf(inWorkers)("accepts a declared basename under a directory", async () => {
    const fixtureRoot = await createContextFixture({
      "AGENTS.md": "Product facts live in `docs/product/`: `constraints.md`.\n",
      "docs/product/constraints.md": "# Constraints\n",
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });

  test.skipIf(inWorkers)("accepts documents of any size", async () => {
    const fixtureRoot = await createContextFixture({
      "docs/agents/large.md": `# Large\n\n${"Any length remains valid.\n".repeat(50_000)}`,
    });

    const result = await runChecker(repositoryRoot, fixtureRoot);

    expect(result).toEqual({ failures: [], ok: true });
  });
});
