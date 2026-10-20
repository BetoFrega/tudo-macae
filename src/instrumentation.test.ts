import { beforeEach, describe, expect, test, vi } from "vitest";

const { seedDemoData, seedDemoImages, registerPosthogTracing } = vi.hoisted(() => ({
  registerPosthogTracing: vi.fn(),
  seedDemoData: vi.fn(),
  seedDemoImages: vi.fn(),
}));

vi.mock("@/packages/demo-seed", () => ({ seedDemoData, seedDemoImages }));
vi.mock("./posthogTracing", () => ({ registerPosthogTracing }));

import { register } from "./instrumentation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

describe("register", () => {
  test("registers tracing only in the Node runtime", async () => {
    seedDemoData.mockResolvedValue({ seeded: false });
    seedDemoImages.mockResolvedValue(undefined);
    await register();
    expect(registerPosthogTracing).toHaveBeenCalledOnce();
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(registerPosthogTracing).toHaveBeenCalledOnce();
  });

  test("continues startup with a safe diagnostic if tracing setup fails", async () => {
    registerPosthogTracing.mockRejectedValueOnce(new Error("private error"));
    seedDemoData.mockResolvedValue({ seeded: false });
    seedDemoImages.mockResolvedValue(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await register();
      expect(seedDemoData).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(JSON.stringify({ severity: "ERROR", event: "next.tracing.setup-failed" }));
    }
    finally {
      log.mockRestore();
    }
  });

  test("leaves the demo seed outside the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(seedDemoData).not.toHaveBeenCalled();
    expect(seedDemoImages).not.toHaveBeenCalled();
    expect(registerPosthogTracing).not.toHaveBeenCalled();
  });

  test("waits for content, then starts images without delaying server readiness", async () => {
    let finishContent!: (summary: { seeded: boolean }) => void;
    seedDemoData.mockImplementation(() => new Promise((resolve) => {
      finishContent = resolve;
    }));
    seedDemoImages.mockImplementation(() => new Promise(() => {}));

    const registration = register();
    await vi.waitFor(() => expect(seedDemoData).toHaveBeenCalledOnce());
    expect(seedDemoImages).not.toHaveBeenCalled();

    finishContent({ seeded: true });
    await registration;

    expect(seedDemoImages).toHaveBeenCalledOnce();
  });

  test("loads the demo seed dynamically instead of placing it in the instrumentation module graph", async () => {
    const source = await import("node:fs/promises").then(fs => fs.readFile(
      "src/instrumentation.ts",
      "utf8",
    ));

    expect(source).not.toMatch(
      /^import(?:\s+type)?(?:[\s\S]*?\sfrom\s+)?["']@\/packages\/demo-seed["'];?/m,
    );
    expect(source).toContain("await import(\"@/packages/demo-seed\")");
  });
});
