import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { standaloneHarnessTests } from "./bin/playwrightCollections";

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: standaloneHarnessTests,
  timeout: 60_000,
  maxFailures: 0,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: fileURLToPath(new URL("test-results/harness", import.meta.url)),
  use: {
    baseURL: "http://harness.test",
    ...(process.env.E2E_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
