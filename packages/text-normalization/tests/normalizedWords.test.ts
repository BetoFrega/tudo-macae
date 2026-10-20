// @vitest-environment node
import { describe, expect, test } from "vitest";
import { normalizedWords } from "../normalizedWords";

describe("normalizedWords", () => {
  test("lowercases and removes the accent from Portuguese letters", () => {
    expect(normalizedWords("AÇÃO na Ciência")).toEqual(["acao", "na", "ciencia"]);
  });

  test("separates words at any run of other characters", () => {
    expect(normalizedWords("  Feira-de ciência,\n2027!  ")).toEqual(["feira", "de", "ciencia", "2027"]);
  });

  test("treats other accented letters and combining marks as separators, as existing slugs do", () => {
    expect(normalizedWords("Øresund")).toEqual(["resund"]);
    expect(normalizedWords("Ångström")).toEqual(["ngstrom"]);
    expect(normalizedWords("Cie\u0302ncia")).toEqual(["cie", "ncia"]);
  });

  test("returns no words when nothing is a letter or digit", () => {
    expect(normalizedWords("")).toEqual([]);
    expect(normalizedWords("!@#$%")).toEqual([]);
  });

  test("keeps words beyond any slug length", () => {
    const words = normalizedWords(`${"palavra ".repeat(20)}final`);
    expect(words).toHaveLength(21);
    expect(words.at(-1)).toBe("final");
  });
});
