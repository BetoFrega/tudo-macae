import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
beforeEach((context) => {
  if (inWorkers) context.skip();
});

const repository = process.cwd();
function inspect(files: Record<string, string>) {
  const directory = mkdtempSync(path.join(tmpdir(), "workspace-boundaries-"));
  try {
    for (const [file, content] of Object.entries({ "tsconfig.json": "{}", ...files })) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), content);
    }
    try {
      return execFileSync(path.join(repository, "node_modules/.bin/depcruise"), ["--config", path.join(repository, ".dependency-cruiser.cjs"), "--output-type", "err", "apps", "packages"], { cwd: directory, encoding: "utf8", stdio: "pipe" });
    }
    catch (error) {
      return (error as { stdout: string }).stdout;
    }
  }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test("allows an app to use a package entry and the package to use its private implementation", () => {
  expect(inspect({
    "apps/www-origin/index.ts": "import \"../../packages/routing/router\";",
    "packages/routing/router.ts": "import \"./lib/rule\";",
    "packages/routing/lib/rule.ts": "export const value = 1;",
  })).not.toContain("error");
});

for (const [rule, files] of [
  ["entrypoint-boundary-from-app", {
    "apps/www-origin/index.ts": "import \"../../packages/routing/lib/rule\";",
    "packages/routing/lib/rule.ts": "export const value = 1;",
  }],
  ["workspace-package-to-app", {
    "packages/routing/router.ts": "import \"../../apps/www-origin/index\";",
    "apps/www-origin/index.ts": "export const value = 1;",
  }],
  ["app-to-app", {
    "apps/www-origin/index.ts": "import \"../web-workers/index\";",
    "apps/web-workers/index.ts": "export const value = 1;",
    "packages/routing/router.ts": "export const value = 1;",
  }],
  ["workspace-app-to-legacy-app", {
    "apps/web-workers/index.ts": "import \"../../src/components/ui/button\";",
    "src/components/ui/button.tsx": "export const value = 1;",
    "packages/layout/frame.ts": "export const value = 1;",
  }],
  ["portable-react-without-next", {
    "packages/site-layout/frame.ts": "import \"next/navigation\";",
    "apps/web-workers/index.ts": "export const value = 1;",
  }],
  ["no-circular", {
    "apps/www-origin/index.ts": "import \"../../packages/routing/router\";",
    "packages/routing/router.ts": "import \"../other/router\";",
    "packages/other/router.ts": "import \"../routing/router\";",
  }],
] as const) {
  test(`rejects ${rule} in workspace source`, () => expect(inspect(files)).toContain(rule));
}
