import { defineConfig } from "@playwright/test";
import application from "./playwright.config";
import harness from "./playwright.harness.config";
import { standaloneHarnessTests } from "./bin/playwrightCollections";

/** Complete local verification shares one application stack across both collections. */
export default defineConfig(application, {
  testIgnore: [],
  projects: [
    ...application.projects!.map(project => ({
      ...project,
      testIgnore: standaloneHarnessTests,
    })),
    ...harness.projects!.map(project => ({
      ...project,
      name: `harness-${project.name}`,
      testMatch: standaloneHarnessTests,
      use: { ...harness.use, ...project.use },
    })),
  ],
});
