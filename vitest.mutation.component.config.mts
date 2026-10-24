import { defineConfig, mergeConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { unitMutationTierByName } from "./bin/mutationTiers.ts";
import { sourceTestConfig } from "./vitest.shared.mts";

export default mergeConfig(
  sourceTestConfig,
  defineConfig({
    plugins: [react()],
    test: {
      environment: "jsdom",
      include: [...unitMutationTierByName.component.tests],
      exclude: ["**/node_modules/**"],
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
