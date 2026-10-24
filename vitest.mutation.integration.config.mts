import { defineConfig, mergeConfig } from "vitest/config";
import { sourceTestConfig } from "./vitest.shared.mts";

/** Integration mutation runs the `*.integration.test.ts` files one at a time. */
export default mergeConfig(
  sourceTestConfig,
  defineConfig({
    test: {
      environment: "node",
      include: [
        "src/**/*.integration.test.ts",
        "packages/**/*.integration.test.ts",
      ],
      setupFiles: ["./vitest.setup.ts"],
      fileParallelism: false,
    },
  }),
);
