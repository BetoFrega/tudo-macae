import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

test("exposes route-aware TypeScript validation without starting the application stack", () => {
  expect(packageJson.scripts.typecheck).toBe("next typegen && tsc --noEmit");
});

test("keeps pre-push limited to the fast typecheck", () => {
  const commands = readFileSync(".husky/pre-push", "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));

  expect(commands.filter(line => line.startsWith("pnpm "))).toEqual(["pnpm run typecheck"]);
  expect(commands.join("\n")).not.toMatch(/build|emulator|playwright|test:e2e/);
});

test("uploads Git LFS objects before the typecheck consumes pre-push stdin", () => {
  const prePush = readFileSync(".husky/pre-push", "utf8");

  expect(prePush.indexOf("git lfs pre-push \"$@\"")).toBeGreaterThan(-1);
  expect(prePush.indexOf("git lfs pre-push \"$@\"")).toBeLessThan(prePush.indexOf("pnpm run typecheck"));
});
