import { afterEach, describe, expect, test, vi } from "vitest";
import { seedDemoData, seedDemoImages } from "../index";

/**
 * The guard is exercised through the entry point rather than imported, because
 * the entry point is the whole package interface — and because what matters is
 * not only the answer but that a refusal writes nothing. Importing the
 * predicate directly would prove the first and not the second.
 *
 * Every case here refuses. The accepting case needs the API Worker fixture and
 * lives in `demoSeed.integration.test.ts`.
 */
function runningAs(env: Record<string, string | undefined>) {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTHENTICATION_FIXTURE_CONFIGURATION", "/tmp/authentication-runtime.json");

  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seedDemoData environment guard", () => {
  test("refuses outside the Node.js runtime", async () => {
    runningAs({ NEXT_RUNTIME: "edge" });

    expect(await seedDemoData()).toEqual({
      seeded: false,
      accounts: 0,
      businesses: 0,
      ads: 0,
      articles: 0,
    });
  });

  test("refuses outside development, so a deployed server never seeds", async () => {
    runningAs({ NODE_ENV: "production" });

    expect(await seedDemoData()).toMatchObject({ seeded: false });
  });

  test("refuses without the local API Worker fixture, the only target of the writes", async () => {
    runningAs({ AUTHENTICATION_FIXTURE_CONFIGURATION: undefined });

    expect(await seedDemoData()).toMatchObject({ seeded: false });
  });
});

describe("seedDemoImages environment guard", () => {
  test("does not start image work without the explicit opt-in", async () => {
    runningAs({ DEMO_SEED_IMAGES: undefined });
    const fetchImage = vi.spyOn(globalThis, "fetch");

    expect(await seedDemoImages()).toEqual({
      seeded: false,
      total: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
    });
    expect(fetchImage).not.toHaveBeenCalled();
  });

  test("refuses the opt-in without the local API Worker fixture", async () => {
    runningAs({
      DEMO_SEED_IMAGES: "1",
      AUTHENTICATION_FIXTURE_CONFIGURATION: undefined,
    });
    const fetchImage = vi.spyOn(globalThis, "fetch");

    expect(await seedDemoImages()).toMatchObject({
      seeded: false,
    });
    expect(fetchImage).not.toHaveBeenCalled();
  });
});
