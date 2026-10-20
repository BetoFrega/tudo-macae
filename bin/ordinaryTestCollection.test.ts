import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { configDefaults } from "vitest/config";
import { expect, it } from "vitest";
import type ordinaryConfig from "../vitest.config.mts";

// Loading the Vitest configs starts Vite's native bundler, which the Workers runtime
// (quality-flare's Tests check) cannot load, so only Node imports them.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
const [ordinary, unit, integration, worker, webWorkersApp]: (typeof ordinaryConfig)[] = inWorkers
  ? []
  : await Promise.all([
      import("../vitest.config.mts"),
      import("../vitest.unit.config.mts"),
      import("../vitest.integration.config.mts"),
      import("../vitest.worker.config.mts"),
      import("../apps/web-workers/vitest.config.mts"),
    ].map(async config => (await config).default));

// The unit tier splits its files between an isolated and a shared project.
function projects(config: typeof ordinary) {
  return (config.test?.projects as (typeof ordinary)[] | undefined) ?? [config];
}

function files(config: typeof ordinary, cwd = ".") {
  return projects(config).flatMap(project => [...globSync(project.test?.include ?? [], {
    cwd,
    exclude: project.test?.exclude ?? configDefaults.exclude,
  })].map(file => path.join(cwd, file))).sort();
}

it.skipIf(inWorkers)("partitions the conventional collection without losing or repeating any file", () => {
  const previous = [...files(ordinary)].sort();
  const tiers = [...files(unit), ...files(integration)].sort();
  expect(tiers).toEqual(previous);
  expect(new Set(tiers).size).toBe(tiers.length);
});

// Playwright owns tests/e2e; every other test file belongs to exactly one suite
// that a pull-request workflow runs. A new suite, runner or test location fails here
// until it is added to both this map and checks.yml.
it.skipIf(inWorkers)("gives every test file to exactly one suite a pull-request workflow runs", () => {
  const suites = {
    "npm run test:unit -- --shard=${{ matrix.shard }}/2": files(unit),
    "npm test -- --tier=integration": files(integration),
    "npm run test:worker": files(worker),
    "npm test --workspace=web-workers-app": files(webWorkersApp, "apps/web-workers"),
    "node --test apps/public-images/deploy.test.mjs": ["apps/public-images/deploy.test.mjs"],
  };
  const tracked = globSync("**/*.{test,spec}.{ts,tsx,js,mjs}", {
    exclude: [...configDefaults.exclude, "tests/e2e/**", "**/.*/**"],
  }).sort();
  const selected = Object.values(suites).flat().sort();
  expect(selected).toEqual(tracked);
  expect(new Set(selected).size).toBe(selected.length);
  const checks = readFileSync(".github/workflows/checks.yml", "utf8");
  const vitestAction = readFileSync(".github/actions/run-vitest/action.yml", "utf8");
  for (const command of Object.keys(suites)) {
    expect(checks + vitestAction, command).toContain(command);
  }
});

it.skipIf(inWorkers)("keeps fixture-backed integration out of unit", () => {
  expect(files(unit).every(file => !file.includes(".integration.test."))).toBe(true);
  expect(files(integration).every(file => file.includes(".integration.test."))).toBe(true);
  expect(files(integration).length).toBeGreaterThan(0);
});

it.skipIf(inWorkers)("caps integration workers around the shared API Worker fixture", () => {
  expect(integration.test?.maxWorkers).toBe(2);
});

it("runs unannotated tests without browser globals", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
});

it.skipIf(inWorkers)("defaults every ordinary entrypoint to Node", () => {
  for (const config of [ordinary, ...projects(unit), integration]) {
    expect(config.test?.environment).toBe("node");
  }
});

it.skipIf(inWorkers)("requires explicit DOM opt-in and keeps server integration in Node", () => {
  const browserExceptions: string[] = [];
  for (const file of [...files(unit), ...files(integration)]) {
    const source = readFileSync(file, "utf8");
    const environment = source.match(/@vitest-environment\s+(\S+)/)?.[1];
    if (/@testing-library\/(react|user-event)/.test(source)) {
      expect(environment, file).toBe("jsdom");
    }
    if (file.includes(".integration.test.")) {
      expect(environment ?? "node", file).toBe("node");
    }
    if (environment === "jsdom" && !file.endsWith(".tsx")) browserExceptions.push(file);
  }
  expect(browserExceptions.sort()).toEqual(["packages/media/tests/imageProcessing.test.ts"]);
});
