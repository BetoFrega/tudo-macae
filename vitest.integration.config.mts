import { defineConfig } from "vitest/config";
import ordinary from "./vitest.config.mts";

export default defineConfig({
  ...ordinary,
  test: {
    ...ordinary.test,
    include: ["src/**/*.integration.test.{ts,tsx}", "packages/**/*.integration.test.{ts,tsx}", "bin/**/*.integration.test.ts"],
    setupFiles: [
      ...(ordinary.test?.setupFiles ?? []),
      "./vitest.integration.setup.ts",
    ],
    // Every worker shares the one API Worker fixture that
    // bin/test-integration.mjs starts.
    maxWorkers: 2,
  },
});
