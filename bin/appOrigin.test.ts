// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CANONICAL_APP_ORIGIN } from "./appOrigin";
import { productionWebWorkerVariables } from "./devEnvironment";

describe("CANONICAL_APP_ORIGIN", () => {
  it("is the origin wrangler.web.jsonc gives the production web Worker", () => {
    expect(productionWebWorkerVariables().PUBLIC_APP_ORIGIN).toBe(CANONICAL_APP_ORIGIN);
  });
});
