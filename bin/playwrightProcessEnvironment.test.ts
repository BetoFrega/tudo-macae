import { expect, test } from "vitest";
import { playwrightProcessEnvironment, reusePlaywrightServer } from "../tests/e2e/bin/playwrightProcessEnvironment";

test("fixture-owned runs require a fresh server even outside CI", () => {
  expect(reusePlaywrightServer({})).toBe(true);
  expect(reusePlaywrightServer({ CI: "1" })).toBe(false);
  expect(reusePlaywrightServer({ E2E_REQUIRE_FRESH_SERVER: "1" })).toBe(false);
});

test("does not pass NO_COLOR to Playwright, which forces its own color mode", () => {
  expect(playwrightProcessEnvironment({
    FORCE_COLOR: "1",
    NO_COLOR: "1",
    PRESERVED: "yes",
  })).toEqual({ FORCE_COLOR: "1", PRESERVED: "yes" });
});

test("removes NO_COLOR before Playwright adds FORCE_COLOR", () => {
  expect(playwrightProcessEnvironment({ NO_COLOR: "1" })).toEqual({});
});
