import { describe, expect, it } from "vitest";
import {
  advertiserProfileRecordSchema,
  adminClaimableAdvertiserProfileFormSchema,
} from "../client";

describe("Advertiser Profile Validation", () => {
  it("should validate a valid profile without contacts", () => {
    const validData = {
      title: "Valid Title",
      description: "Valid Description",
      contacts: [],
    };
    const result = advertiserProfileRecordSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should validate a valid profile with valid contacts", () => {
    const validData = {
      title: "Valid Title",
      description: "Valid Description",
      contacts: [
        { number: "11999999999", isWhatsapp: true },
        { number: "21988888888", isWhatsapp: false },
      ],
    };
    const result = advertiserProfileRecordSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should fail when phone number is invalid", () => {
    const invalidData = {
      title: "Valid Title",
      description: "Valid Description",
      contacts: [{ number: "123", isWhatsapp: true }],
    };
    const result = advertiserProfileRecordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Telefone inválido");
    }
  });

  it("should fail when contacts exceed maximum limit", () => {
    const invalidData = {
      title: "Valid Title",
      description: "Valid Description",
      contacts: [
        { number: "11999999999", isWhatsapp: true },
        { number: "11999999999", isWhatsapp: true },
        { number: "11999999999", isWhatsapp: true },
        { number: "11999999999", isWhatsapp: true },
      ],
    };
    const result = advertiserProfileRecordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Máximo de 3 contatos");
    }
  });

  it("should use default value for contacts if not provided", () => {
    const validData = {
      title: "Valid Title",
    };
    // The schema expects input to match Zod structure. 'contacts' has .default([]).
    // However, depending on strictness, it might require explicit definition if strict() is used or if partial() isn't.
    // advertiserProfileRecordSchema is likely an object schema.
    const result = advertiserProfileRecordSchema.safeParse(validData);
    // If original schema has contacts.optional().default([]), it should pass.
    // But let's check the schema definition.
    // Based on previous file reads, it had optional().default([]).
    // If I removed .optional() in the *Form* file, that doesn't affect the *validation.ts* file unless I edit that too.
    // The validation.ts file is separate.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contacts).toEqual([]);
    }
  });

  it.each([
    [[], [{ categoryId: "services", subcategoryId: "food" }], "https://example.com"],
    [[{ number: "22999999999", isWhatsapp: false }], [], "https://example.com"],
    [[{ number: "22999999999", isWhatsapp: false }], [{ categoryId: "services", subcategoryId: "food" }], "ftp://example.com"],
  ])("requires contact, activity area and an HTTP(S) source for claimable profiles", (
    contacts,
    activityAreas,
    sourceUrl,
  ) => {
    expect(adminClaimableAdvertiserProfileFormSchema.safeParse({
      title: "Perfil público",
      description: "",
      contacts,
      activityAreas,
      sourceUrl,
    }).success).toBe(false);
  });
});
