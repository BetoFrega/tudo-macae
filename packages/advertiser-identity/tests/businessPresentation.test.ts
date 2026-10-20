import { describe, expect, test } from "vitest";
import {
  businessCanonicalPath,
  businessMetadataDescription,
  businessMissingRequirements,
} from "../businessPresentation";

describe("business presentation", () => {
  test("names the requirements missing from a public business", () => {
    expect(businessMissingRequirements(["contact", "activityArea"]))
      .toBe("contato, Área de atuação ativa");
  });
  test("builds the canonical ID plus slug route", () => {
    expect(businessCanonicalPath({ id: "abc", title: "Café com Arte" }))
      .toBe("/negocio/abc/cafe-com-arte");
  });

  test("uses a bounded factual description without inventing attributes", () => {
    const description = businessMetadataDescription({
      title: "Café com Arte",
      description: "  Cafeteria local com cafés e lanches. ".repeat(12),
    });
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain("Cafeteria local");
    expect(description).not.toMatch(/verificad|recomendad|melhor/iu);
    expect(businessMetadataDescription({ title: "Café com Arte" }))
      .toBe("Encontre informações e contatos de Café com Arte, negócio de Macaé, no Tudo Macaé.");
  });
});
