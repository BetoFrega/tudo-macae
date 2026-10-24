import { defineConfig, mergeConfig } from "vitest/config";
import { unitMutationTierByName } from "./bin/mutationTiers.ts";
import { sourceTestConfig } from "./vitest.shared.mts";

export default mergeConfig(
  sourceTestConfig,
  defineConfig({
    test: {
      environment: "node",
      include: [...unitMutationTierByName.pure.tests],
    },
  }),
);
