import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

test("exposes route-aware TypeScript validation without starting the application stack", () => {
  expect(packageJson.scripts.typecheck).toBe("next typegen && tsc --noEmit");
});

test("keeps pre-push limited to the fast typecheck", () => {
  const prePush = readFileSync(".husky/pre-push", "utf8").trim();

  expect(prePush).toBe("npm run typecheck");
  expect(prePush).not.toMatch(/build|emulator|playwright|test:e2e/);
});
