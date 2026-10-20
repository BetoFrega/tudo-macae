import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import { unitMutationTierByName } from "./bin/mutationTiers.ts";
import { sharedTestConfig } from "./vitest.shared.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  sharedTestConfig,
  defineConfig({
    test: {
      environment: "node",
      include: [...unitMutationTierByName.pure.tests],
      globals: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
);
