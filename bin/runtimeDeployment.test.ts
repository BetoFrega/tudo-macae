import { describe, expect, test } from "vitest";
import { runtimeDeploymentId } from "./runtimeDeployment";

describe("runtimeDeploymentId", () => {
  test("uses the identity embedded by the build rather than the Cloud Run revision", () => {
    expect(runtimeDeploymentId({ K_REVISION: "macaetem-dev-00042-abc" }, "source-build"))
      .toBe("source-build");
  });

  test("preserves a matching explicit Next.js deployment identity", () => {
    expect(runtimeDeploymentId({
      K_REVISION: "macaetem-dev-00042-abc",
      NEXT_DEPLOYMENT_ID: "explicit-deployment",
    }, "explicit-deployment")).toBe("explicit-deployment");
  });

  test("rejects a runtime override that differs from the built application", () => {
    expect(() => runtimeDeploymentId({
      NEXT_DEPLOYMENT_ID: "runtime-deployment",
    }, "built-deployment")).toThrow("does not match");
  });

  test.each(["", "bad identity", "<identity>"])(
    "rejects an unsafe built identity: %j",
    (deploymentId) => {
      expect(() => runtimeDeploymentId({}, deploymentId)).toThrow("deployment identity");
    },
  );
});
