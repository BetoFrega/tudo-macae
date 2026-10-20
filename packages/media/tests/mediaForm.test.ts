import { describe, expect, test } from "vitest";
import {
  mediaFormFromMetadata,
  mediaFormSchema,
  mediaMetadataFromForm,
} from "@tudomacae/media/form";

const baseForm = {
  kind: "article-image" as const,
  alt: "  Fachada histórica  ",
  caption: "  Acervo municipal.  ",
  origin: "third-party" as const,
  creator: "  João da Silva  ",
  credit: "  Foto: João da Silva  ",
  acquiredAt: "2026-08-20T14:30",
  displayBasis: "license" as const,
  provider: "  Arquivo Municipal  ",
  sourceUrl: "https://example.com/acervo/fachada",
  license: "  CC BY 4.0  ",
  permissionReference: "",
};

describe("Media form contract", () => {
  test("trims form text and maps licensed provenance to canonical metadata", () => {
    const parsed = mediaFormSchema.parse(baseForm);

    expect(mediaMetadataFromForm(parsed)).toEqual({
      kind: "article-image",
      alt: "Fachada histórica",
      caption: "Acervo municipal.",
      provenance: {
        origin: "third-party",
        provider: "Arquivo Municipal",
        sourceUrl: "https://example.com/acervo/fachada",
        creator: "João da Silva",
        credit: "Foto: João da Silva",
        acquiredAt: Date.parse("2026-08-20T17:30:00.000Z"),
        displayBasis: "license",
        license: "CC BY 4.0",
      },
    });
  });

  test("maps permission provenance without inventing an optional source URL", () => {
    const parsed = mediaFormSchema.parse({
      ...baseForm,
      displayBasis: "permission",
      sourceUrl: "",
      license: "",
      permissionReference: "  authorization-2026-08  ",
    });

    expect(mediaMetadataFromForm(parsed).provenance).toEqual({
      origin: "third-party",
      provider: "Arquivo Municipal",
      creator: "João da Silva",
      credit: "Foto: João da Silva",
      acquiredAt: Date.parse("2026-08-20T17:30:00.000Z"),
      displayBasis: "permission",
      permissionReference: "authorization-2026-08",
    });
  });

  test.each([
    ["own-production", "license"],
    ["generated", "own-production"],
    ["third-party", "generated"],
  ] as const)("refuses incompatible origin %s and basis %s", (origin, displayBasis) => {
    expect(() => mediaFormSchema.parse({
      ...baseForm,
      origin,
      displayBasis,
    })).toThrow();
  });

  test.each(["Foto: João", "Arte: Ai Weiwei"])("rejects generated Credit %s without AI identification", (credit) => {
    const generated = { ...baseForm, origin: "generated", displayBasis: "generated", credit };
    expect(mediaFormSchema.safeParse(generated).success).toBe(false);
    expect(mediaFormSchema.parse({ ...generated, credit: "Tudo Macaé AI" }).alt).toBe("Fachada histórica");
  });

  test("requires the third-party provider and the evidence for its selected basis", () => {
    expect(() => mediaFormSchema.parse({ ...baseForm, provider: " " })).toThrow();
    expect(() => mediaFormSchema.parse({ ...baseForm, license: " " })).toThrow();
    expect(() => mediaFormSchema.parse({
      ...baseForm,
      displayBasis: "permission",
      license: "",
      permissionReference: " ",
    })).toThrow();
  });

  test.each([
    {
      origin: "own-production" as const,
      creator: "Maria Souza",
      credit: "Foto: Maria Souza/Tudo Macaé",
      acquiredAt: Date.parse("2026-08-20T17:30:00.000Z"),
      displayBasis: "own-production" as const,
    },
    {
      origin: "generated" as const,
      creator: "OpenAI ImageGen",
      credit: "Tudo Macaé AI",
      acquiredAt: Date.parse("2026-08-20T17:30:00.000Z"),
      displayBasis: "generated" as const,
    },
    {
      origin: "third-party" as const,
      provider: "Arquivo Municipal",
      creator: "João da Silva",
      credit: "Foto: João da Silva",
      acquiredAt: Date.parse("2026-08-20T17:30:00.000Z"),
      displayBasis: "permission" as const,
      permissionReference: "authorization-2026-08",
    },
  ])("round-trips canonical $origin metadata through the editor form", (provenance) => {
    const metadata = {
      kind: "article-image" as const,
      alt: "Fachada histórica",
      caption: "Acervo municipal.",
      provenance,
    };

    const form = mediaFormFromMetadata(metadata);
    expect(mediaMetadataFromForm(mediaFormSchema.parse(form))).toEqual(metadata);
  });
});
