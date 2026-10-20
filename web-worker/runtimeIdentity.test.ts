import { expect, test } from "vitest";
import { isRuntimeName } from "@tudomacae/www-origin-routing/release";
import { workerRevision } from "./runtimeIdentity";

test("a deployed Worker's revision is its service and the version Cloudflare serves", () => {
  const revision = workerRevision({
    K_SERVICE: "tudo-macae-terms-workers",
    CF_VERSION_METADATA: { id: "0f8d5b2e-7c1a-4e39-9b6d-2a4c8e1f3d57" },
  });
  expect(revision).toBe("tudo-macae-terms-workers-0f8d5b2e-7c1a-4e39-9b6d-2a4c8e1f3d57");
  expect(isRuntimeName(revision ?? "")).toBe(true);
});

test("a Worker without K_SERVICE keeps the local diagnostics identity", () => {
  expect(workerRevision({ CF_VERSION_METADATA: { id: "0f8d5b2e-7c1a-4e39-9b6d-2a4c8e1f3d57" } })).toBeUndefined();
});
