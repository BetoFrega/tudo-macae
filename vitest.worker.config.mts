import { mergeConfig } from "vitest/config";
import { sharedTestConfig } from "./vitest.shared.mts";

export default mergeConfig(sharedTestConfig, {
  test: {
    environment: "node",
    // Bundle setup runs alongside other workspace builds in affected CI.
    hookTimeout: 60_000,
    include: ["workers/**/*.runtime.test.ts", "apps/**/*.runtime.test.ts", "bin/**/*.runtime.test.ts"],
  },
});
