import { expect, test } from "vitest";
import { reusedRendererMismatch } from "./e2eStack";

test("a reused server serves the run only when it was started with the same renderer", () => {
  expect(reusedRendererMismatch("vinext", "vinext")).toBeUndefined();
  expect(reusedRendererMismatch("vinext", "next")).toContain("E2E_RENDERER=next");
  expect(reusedRendererMismatch("next", undefined)).toContain("E2E_RENDERER=unknown");
});
