import { expect, test } from "vitest";
import { assertEmailAllowsPublication } from "../publicationEligibility";

test("unconfirmed accounts may keep an active ad but cannot activate a paused ad", () => {
  expect(() => assertEmailAllowsPublication(false, "paused", "active")).toThrow("Confirme seu e-mail");
  expect(() => assertEmailAllowsPublication(false, undefined, "active")).toThrow("Confirme seu e-mail");
  expect(() => assertEmailAllowsPublication(false, "active", "active")).not.toThrow();
  expect(() => assertEmailAllowsPublication(false, "active", "paused")).not.toThrow();
  expect(() => assertEmailAllowsPublication(true, "paused", "active")).not.toThrow();
});
