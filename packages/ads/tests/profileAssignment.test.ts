import { describe, expect, it } from "vitest";
import { assertProfileBelongsToAdOwner } from "../profileAssignment";

describe("ad profile assignment", () => {
  it("accepts only profiles owned by the ad owner", () => {
    expect(() => assertProfileBelongsToAdOwner("owner", "owner")).not.toThrow();
    expect(() => assertProfileBelongsToAdOwner("owner", "other"))
      .toThrow("deve pertencer ao proprietário");
    expect(() => assertProfileBelongsToAdOwner("owner", undefined))
      .toThrow("deve pertencer ao proprietário");
  });
});
