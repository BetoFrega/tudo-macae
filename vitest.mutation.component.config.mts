import { defineConfig, mergeConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { unitMutationTierByName } from "./bin/mutationTiers.ts";
import { sharedTestConfig } from "./vitest.shared.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  sharedTestConfig,
  defineConfig({
    plugins: [react()],
    test: {
      environment: "jsdom",
      include: [...unitMutationTierByName.component.tests],
      exclude: ["**/node_modules/**"],
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
);
