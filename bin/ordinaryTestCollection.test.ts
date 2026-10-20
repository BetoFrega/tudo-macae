import { globSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type ordinaryConfig from "../vitest.config.mts";

// Loading the Vitest configs starts Vite's native bundler, which the Workers runtime
// (quality-flare's Tests check) cannot load, so only Node imports them.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
const [ordinary, unit, integration]: (typeof ordinaryConfig)[] = inWorkers
  ? []
  : await Promise.all([
      import("../vitest.config.mts"),
      import("../vitest.unit.config.mts"),
      import("../vitest.integration.config.mts"),
    ].map(async config => (await config).default));

// The unit tier splits its files between an isolated and a shared project.
function projects(config: typeof ordinary) {
  return (config.test?.projects as (typeof ordinary)[] | undefined) ?? [config];
}

function files(config: typeof ordinary) {
  return projects(config).flatMap(project => [...globSync(project.test?.include ?? [], {
    exclude: project.test?.exclude ?? [],
  })]).sort();
}

it.skipIf(inWorkers)("partitions the conventional collection without losing or repeating any file", () => {
  const previous = [...files(ordinary)].sort();
  const tiers = [...files(unit), ...files(integration)].sort();
  expect(tiers).toEqual(previous);
  expect(new Set(tiers).size).toBe(tiers.length);
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
