// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import pure from "../stryker.pure.config.mjs";
import component from "../stryker.component.config.mjs";
import integration from "../stryker.integration.config.mjs";
import { integrationMutationScope } from "./integrationMutationTier";
import { unitMutationTierByName } from "./mutationTiers";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const skill = readFileSync(".agents/skills/kill-mutants/SKILL.md", "utf8");
const commands = skill.match(/```bash\n([\s\S]*?)```/)?.[1].trim().split("\n") ?? [];
const configs = { pure, component, integration };

// Run the documented shell quoting with an inert npm; no Stryker process starts.
function captureArguments(command: string): string[] {
  return execFileSync("bash", ["-c", `
    npm() { printf '%s\\n' "$@"; }
    ${command}
  `], { encoding: "utf8" }).trim().split("\n");
}

describe("documented focal mutation commands", () => {
  it("mutates ad management rules in the pure tier", () => {
    expect(pure.mutate).toContain("packages/ads/management.ts");
    expect(unitMutationTierByName.pure.tests).toContain("packages/ads/tests/management.test.ts");
  });
  // The only integration suites are the demo-seed ones; a file they do not import
  // leaves Stryker's dry run with no tests.
  it("limits integration mutation to existing demo-seed modules", () => {
    expect(integration.mutate).toEqual([...integrationMutationScope]);
    expect(integrationMutationScope).toContain("src/packages/demo-seed/lib/environment.ts");
    for (const file of integrationMutationScope) {
      expect(file).toMatch(/^src\/packages\/demo-seed\//);
      expect(existsSync(file)).toBe(true);
    }
  });

  it.skipIf(inWorkers)("delivers only the representative changed files and ranges to each tier", () => {
    expect(commands).toHaveLength(3);
    const expected = [
      ["pure", "packages/text-normalization/slugify.ts"],
      ["component", "src/features/navigation/UserSidebar.tsx:24-28,src/features/navigation/UserSidebar.tsx:30-37"],
      ["integration", "src/packages/demo-seed/lib/environment.ts"],
    ];
    for (const [index, [tier, scope]] of expected.entries()) {
      expect(captureArguments(commands[index])).toEqual([
        "run", `test:mutation:${tier}`, "--", "--mutate", scope,
      ]);
      for (const entry of scope.split(",")) {
        const file = entry.split(":")[0];
        const owners = Object.entries(configs).filter(([, config]) => {
          const patterns = (config.mutate ?? []).filter(
            (pattern): pattern is string => typeof pattern === "string",
          );
          return patterns.some(pattern => !pattern.startsWith("!") && matchesGlob(file, pattern))
            && !patterns.some(pattern => pattern.startsWith("!") && matchesGlob(file, pattern.slice(1)));
        }).map(([name]) => name);
        expect(owners).toEqual([tier]);
      }
    }
  });
});
