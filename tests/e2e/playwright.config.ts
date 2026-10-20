import { fileURLToPath } from "node:url";
import { harnessTests } from "./bin/playwrightCollections";
import { defineConfig, devices } from "@playwright/test";
import { appUrl as localAppUrl, repositoryRoot } from "../../bin/appPorts";
import { setTestEnvVars } from "../../bin/setTestEnvVars";
import { reusePlaywrightServer } from "./bin/playwrightProcessEnvironment";

// Terminal hosts can set both variables. Keep the harness's color choice
// without propagating a contradictory opt-out to every child process.
if (process.env.FORCE_COLOR !== undefined) delete process.env.NO_COLOR;

setTestEnvVars();

// Derived from this worktree's path, so `reuseExistingServer` can stay on:
// outside CI, "reuse the server already answering here" now means reusing your
// own. Another worktree's app answers on another URL entirely.
const appUrl = localAppUrl();

/**
 * Escape hatch for environments that ship a pre-provisioned Chromium whose
 * build revision does not match the one pinned by `@playwright/test` — cloud
 * sandboxes, devcontainers, custom CI images. Leave it unset everywhere else,
 * including CI, where `playwright install` provides the matching build.
 *
 * See `docs/agents/test-harness-operation.md`.
 */
const chromiumExecutable = process.env.E2E_CHROMIUM_EXECUTABLE;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: 60_000,
  maxFailures: 1,
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testIgnore: harnessTests,
  // Runs after `webServer` answers on the app URL and before the first test. Prepares
  // Git LFS assets when reusing a server and checks the served static assets. See `docs/agents/test-harness-operation.md`.
  globalSetup: fileURLToPath(new URL("_helpers/global-setup.ts", import.meta.url)),
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Pinned to one worker — everywhere, not just in CI — because the suite is
  // not safe to run concurrently.
  //
  // All workers share the API Worker fixture and the Next.js cache. Fixture parity does not
  // establish concurrent isolation; validate that separately before changing
  // this pin. See docs/agents/e2e-test-authoring.md.
  workers: 1,
  reporter: [["html", { open: "never", outputFolder: fileURLToPath(new URL("playwright-report", import.meta.url)) }]],
  outputDir: fileURLToPath(new URL("test-results", import.meta.url)),
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    ...(chromiumExecutable
      ? { launchOptions: { executablePath: chromiumExecutable } }
      : {}),
  },

  snapshotPathTemplate:
    "{testDir}/{testFileDir}/{testFileName}-snaps/{projectName}/{arg}{ext}",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Um binário direto, e não um script de `package.json`: um script para este
    // stack é a resposta errada mais fácil de escolher para "quero ver o app".
    // Ele sobe o fixture do Worker de API, constrói e serve o app — nada dentro dele impõe
    // um prazo mais curto que o `timeout` daqui.
    command: "node tests/e2e/bin/e2e-stack.mjs",
    cwd: repositoryRoot,
    // Playwright ignores web-server stdout by default. The e2e stack inherits
    // build and server output, so pipe it through for diagnosis.
    stdout: "pipe",
    url: appUrl,
    timeout: 300_000, // fixture + next build
    reuseExistingServer: reusePlaywrightServer(),
    gracefulShutdown: {
      // Inner supervisors own detached fixture, build and server groups. A
      // forced outer exit could orphan them, so wait for cooperative cleanup.
      timeout: 0,
      signal: "SIGTERM",
    },
  },
});
