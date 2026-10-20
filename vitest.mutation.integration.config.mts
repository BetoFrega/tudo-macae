import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import { sharedTestConfig } from "./vitest.shared.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Integration mutation runs the `*.integration.test.ts` files one at a time. */
export default mergeConfig(
  sharedTestConfig,
  defineConfig({
    test: {
      environment: "node",
      include: [
        "src/**/*.integration.test.ts",
        "packages/**/*.integration.test.ts",
      ],
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
      fileParallelism: false,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
);
