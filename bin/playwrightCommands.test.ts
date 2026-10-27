import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type applicationConfig from "../playwright.config";
import { SCRIPT_MENU } from "./scripts-help.mjs";

// The Playwright configs load @playwright/test, which the Workers runtime (quality-flare's Tests
// check) cannot load, so only Node imports them.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
const [application, full, harness, harnessApp]: (typeof applicationConfig)[] = inWorkers
  ? []
  : await Promise.all([
      import("../playwright.config"),
      import("../playwright.full.config"),
      import("../playwright.harness.config"),
      import("../playwright.harness-app.config"),
    ].map(async config => (await config).default));

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;

describe.skipIf(inWorkers)("Playwright failure budgets", () => {
  test("application-backed collections stop after their first failure", () => {
    expect(application.maxFailures).toBe(1);
    expect(full.maxFailures).toBe(1);
    expect(harnessApp.maxFailures).toBe(1);
  });

  test("the standalone harness remains unrestricted", () => {
    expect(harness.maxFailures).toBe(0);
  });

  test("lets the supervised stack finish cleanup without a force-kill timeout", () => {
    expect(application.webServer).toMatchObject({
      gracefulShutdown: { signal: "SIGTERM", timeout: 0 },
    });
  });
});

describe("diagnostic Playwright commands", () => {
  test("offer unrestricted variants without hiding later CLI arguments", () => {
    expect(scripts["test:e2e:diagnostic"]).toBe(
      "pnpm --filter @tudomacae/e2e run test:e2e:diagnostic",
    );
    expect(scripts["test:e2e:full:diagnostic"]).toBe(
      "pnpm --filter @tudomacae/e2e run test:e2e:full:diagnostic",
    );
    expect(SCRIPT_MENU.map(entry => entry.script)).toEqual(
      expect.arrayContaining(["test:e2e:diagnostic", "test:e2e:full:diagnostic"]),
    );
  });
});
