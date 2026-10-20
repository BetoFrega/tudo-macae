import { describe, expect, test } from "vitest";
import { summarizeNumbers } from "../index";

describe("summarizeNumbers", () => {
  test("summarizes values through the package entry point", () => {
    expect(summarizeNumbers([2, 5, 8])).toEqual({
      count: 3,
      minimum: 2,
      maximum: 8,
      average: 5,
    });
  });

  test("represents an empty collection without invented values", () => {
    expect(summarizeNumbers([])).toEqual({
      count: 0,
      minimum: null,
      maximum: null,
      average: null,
    });
  });
});
