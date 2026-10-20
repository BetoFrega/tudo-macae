// @vitest-environment node
import { describe, test, expect } from "vitest";
import { slugify } from "../slugify";

describe("slugify", () => {
  test("should convert text with special characters to slug", () => {
    const result = slugify("Olá Mundo! Isto é um teste.");
    expect(result).toBe("ola-mundo-isto-e-um-teste");
    const result2 = slugify(" Café com açúcar & pão-de-ló. ");
    expect(result2).toBe("cafe-com-acucar-pao-de-lo");
  });
  test("should fold uppercase Portuguese letters", () => {
    expect(slugify("AÇÃO NO CAFÉ")).toBe("acao-no-cafe");
  });
  test("should keep existing slugs for other accented letters and combining marks", () => {
    expect(slugify("Ångström")).toBe("ngstrom");
    expect(slugify("Cie\u0302ncia")).toBe("cie-ncia");
  });
  test("should handle empty string", () => {
    const result = slugify("");
    expect(result).toBe("-");
  });
  test("should handle text with only special characters", () => {
    const result = slugify("!@#$%^&*()");
    expect(result).toBe("-");
  });
  test("should handle text with multiple spaces", () => {
    const result = slugify("Hello \n   World");
    expect(result).toBe("hello-world");
  });
  test("should handle text with leading and trailing spaces", () => {
    const result = slugify("   Hello World   ");
    expect(result).toBe("hello-world");
  });
  test("should truncate to 100 characters without a trailing hyphen", () => {
    const result = slugify("a".repeat(105));
    expect(result).toBe("a".repeat(100));
    expect(result.length).toBe(100);

    const withHyphenAtCut = slugify(`${"a".repeat(99)} b`);
    expect(withHyphenAtCut).toBe("a".repeat(99));
  });
});
