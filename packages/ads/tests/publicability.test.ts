import { describe, expect, it } from "vitest";
import {
  hasPublishableProfile,
  missingPublishableProfileRequirements,
} from "../client";
import {
  assertEmailAllowsPublication,
  assertPublishableProfile,
} from "../publicationEligibility";

describe("profile publication requirements", () => {
  it("requires a name and an accepted contact without requiring optional presentation", () => {
    expect(hasPublishableProfile(undefined)).toBe(false);
    expect(hasPublishableProfile({})).toBe(false);
    expect(hasPublishableProfile({ title: "Ana", contacts: "invalid" })).toBe(false);
    expect(hasPublishableProfile({ title: "  ", contacts: [{ number: "22999999999", isWhatsapp: true }] })).toBe(false);
    expect(hasPublishableProfile({ title: "Ana", contacts: [] })).toBe(false);
    expect(hasPublishableProfile({ title: "Ana", contacts: [{ number: "123", isWhatsapp: false }] })).toBe(false);
    expect(hasPublishableProfile({ title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] })).toBe(true);
  });

  it("reports the exact missing profile requirements through the public policy", () => {
    expect(missingPublishableProfileRequirements(undefined)).toEqual(["title", "contact"]);
    expect(missingPublishableProfileRequirements({
      title: "Ana",
      contacts: [],
    })).toEqual(["contact"]);
    expect(missingPublishableProfileRequirements({
      title: "",
      contacts: [{ number: "22999999999" }],
    })).toEqual(["title"]);
    expect(() => assertPublishableProfile({ title: "Ana", contacts: [] })).toThrow(
      "contato válido",
    );
  });

  it("requires verified email only for a new active state", () => {
    expect(() => assertEmailAllowsPublication(false, "paused", "active")).toThrow(
      "Confirme seu e-mail",
    );
    expect(() => assertEmailAllowsPublication(false, "active", "active")).not.toThrow();
    expect(() => assertEmailAllowsPublication(false, "active", "paused")).not.toThrow();
  });
});
