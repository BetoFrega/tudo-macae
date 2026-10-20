// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CANONICAL_APP_ORIGIN } from "./appOrigin";
import { devAppEnvironment } from "./devEnvironment";

describe("devAppEnvironment", () => {
  it("gives next dev the canonical origin and production's browser analytics settings only", () => {
    expect(devAppEnvironment(`{
  "env": {
    "qualification": { "vars": { "NEXT_PUBLIC_POSTHOG_HOST": "https://qualification.example.test" } },
    "production": {
      // Comments are valid in the Worker configuration.
      "vars": {
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN": "phc_example",
        "NEXT_PUBLIC_POSTHOG_HOST": "https://t.example.test",
        "EDITORIAL_MCP_MODE": "enabled",
      }
    }
  }
}`)).toEqual({
      PUBLIC_APP_ORIGIN: CANONICAL_APP_ORIGIN,
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_example",
      NEXT_PUBLIC_POSTHOG_HOST: "https://t.example.test",
    });
  });

  it("fails loudly when production stops declaring an analytics variable", () => {
    expect(() => devAppEnvironment("{ \"env\": { \"production\": { \"vars\": {} } } }")).toThrow("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
  });

  it("reads the tracked production web Worker configuration by default", () => {
    expect(Object.keys(devAppEnvironment()).sort()).toEqual([
      "NEXT_PUBLIC_POSTHOG_HOST",
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
      "PUBLIC_APP_ORIGIN",
    ]);
  });
});
