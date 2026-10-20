import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.runtime.test.ts"],
    hookTimeout: 30_000,
  },
});
