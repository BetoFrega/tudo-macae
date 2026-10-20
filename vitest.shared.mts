import { defineConfig } from "vitest/config";

// Fixture startup and parallel workers contend for CPU at suite start;
// this is headroom against that contention, not an assertion budget. Every
// Vitest-driven tier extends this so the value only needs to change once.
export const sharedTestConfig = defineConfig({
  test: {
    testTimeout: 20_000,
  },
});
