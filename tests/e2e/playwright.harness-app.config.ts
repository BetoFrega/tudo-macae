import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import application from "./playwright.config";
import { applicationHarnessTests } from "./bin/playwrightCollections";

export default defineConfig(application, {
  testMatch: applicationHarnessTests,
  testIgnore: [],
  reporter: "line",
  outputDir: fileURLToPath(new URL("test-results/harness-app", import.meta.url)),
});
