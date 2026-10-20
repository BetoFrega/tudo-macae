import { describe, it, expect } from "vitest";
import { formatPhoneNumber } from "./formatters";

describe("formatPhoneNumber", () => {
  it("formats a 11-digit mobile number correctly", () => {
    const input = "11999999999";
    const expected = "(11) 99999-9999";
    expect(formatPhoneNumber(input)).toBe(expected);
  });

  it("formats a 10-digit landline number correctly", () => {
    const input = "1133333333";
    const expected = "(11) 3333-3333";
    expect(formatPhoneNumber(input)).toBe(expected);
  });

  it("removes non-digit characters and formats correctly", () => {
    const input = "11 99999-9999 ab";
    const expected = "(11) 99999-9999";
    expect(formatPhoneNumber(input)).toBe(expected);
  });

  it("returns the numbers string if length is less than 10", () => {
    const input = "123456789";
    // 9 digits, regex won't match, should return cleaned numbers
    expect(formatPhoneNumber(input)).toBe("123456789");
  });

  it("returns the numbers string if length is greater than 11", () => {
    const input = "123456789012";
    // 12 digits, regex won't match
    expect(formatPhoneNumber(input)).toBe("123456789012");
  });

  it("handles empty string", () => {
    expect(formatPhoneNumber("")).toBe("");
  });
});
