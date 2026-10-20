// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTestEnvVars } from "./setTestEnvVars";

describe("setTestEnvVars", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables GCP metadata-server detection for local processes", () => {
    vi.stubEnv("METADATA_SERVER_DETECTION", "full");

    setTestEnvVars();

    expect(process.env.METADATA_SERVER_DETECTION).toBe("none");
  });
});
