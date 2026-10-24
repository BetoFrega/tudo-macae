import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, mergeConfig } from "vitest/config";

// Fixture startup and parallel workers contend for CPU at suite start;
// this is headroom against that contention, not an assertion budget. Every
// Vitest-driven tier extends this so the value only needs to change once.
export const sharedTestConfig = defineConfig({
  test: {
    testTimeout: 20_000,
  },
});

/** Tiers that run application and package sources: test globals and the `@` alias to `src/`. */
export const sourceTestConfig = mergeConfig(sharedTestConfig, defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
}));
