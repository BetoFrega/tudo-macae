import { describe, expect, test } from "vitest";
import {
  articleImageInputSchema,
  mediaMetadataSchema,
  updateMediaMetadataSchema,
} from "../model";

const ownProduction = {
  origin: "own-production" as const,
  creator: "Maria Souza",
  credit: "Foto: Maria Souza/Tudo Macaé",
  displayBasis: "own-production" as const,
  acquiredAt: 1_777_000_000_000,
};

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    kind: "article-image",
    alt: "Orla dos Cavaleiros ao amanhecer",
    provenance: ownProduction,
    ...overrides,
  };
}

describe("canonical Media model", () => {
  test.each([
    "Praça central. Imagem gerada por IA.",
    "Gerado por IA",
    "Imagem criada por inteligência artificial",
    "Arte produzida com IA.",
  ])("rejects an explicit AI generation notice in a new Caption without classifying the Media: %s", (caption) => {
    const result = updateMediaMetadataSchema.safeParse({
      id: "media-1", expectedRevision: 1, actorId: "editor-1",
      metadata: metadata({ caption }),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["metadata", "caption"] }),
    ]));
  });

  test.each(["", "Competição escolar em Macaé.", "A exposição discute IA na arte."])("accepts generated Media with descriptive alt and Tudo Macaé AI credit: %s", (caption) => {
    const input = metadata({
      caption,
      provenance: { ...ownProduction, origin: "generated", displayBasis: "generated", credit: "Tudo Macaé AI" },
    });
    expect(articleImageInputSchema.parse(input)).toEqual(input);
    expect(updateMediaMetadataSchema.parse({
      id: "media-1", expectedRevision: 1, actorId: "editor-1", metadata: input,
    }).metadata).toEqual(input);
  });

  test.each(["Imagem gerada por IA", "Imagem criada por inteligência artificial", "Tudo Macaé AI / Equipe editorial"])("preserves generated credit %s", (credit) => {
    const input = metadata({
      caption: "",
      provenance: { ...ownProduction, origin: "generated", displayBasis: "generated", credit },
    });
    expect(articleImageInputSchema.parse(input)).toEqual(input);
    expect(updateMediaMetadataSchema.parse({
      id: "media-1", expectedRevision: 1, actorId: "editor-1", metadata: input,
    }).metadata).toEqual(input);
  });

  test.each(["Foto: João", "Arte: Ai Weiwei"])("rejects generated credit %s in registration and correction", (credit) => {
    const input = metadata({
      caption: "",
      provenance: { ...ownProduction, origin: "generated", displayBasis: "generated", credit },
    });
    expect(articleImageInputSchema.safeParse(input).success).toBe(false);
    expect(updateMediaMetadataSchema.safeParse({
      id: "media-1", expectedRevision: 1, actorId: "editor-1", metadata: input,
    }).success).toBe(false);
  });

  test.each(["alt", "creator", "credit"])("rejects blank %s for generated Media", (field) => {
    const provenance = { ...ownProduction, origin: "generated", displayBasis: "generated", credit: "Tudo Macaé AI" };
    const input = field === "alt"
      ? metadata({ alt: " ", provenance })
      : metadata({ provenance: { ...provenance, [field]: " " } });
    expect(articleImageInputSchema.safeParse(input).success).toBe(false);
  });

  test("preserves historical notices and legitimate editorial mentions without reclassifying provenance", () => {
    const historical = metadata({ caption: "Praça central. Imagem gerada por IA." });
    expect(mediaMetadataSchema.parse(historical).caption).toBe("Praça central. Imagem gerada por IA.");
    const updated = updateMediaMetadataSchema.parse({
      id: "media-1", expectedRevision: 1, actorId: "editor-1",
      metadata: metadata({ caption: "A exposição discute imagem gerada por IA na arte." }),
    });
    expect(updated.metadata.provenance.origin).toBe("own-production");
    expect(updated.metadata.caption).toBe("A exposição discute imagem gerada por IA na arte.");
  });

  test("validates non-blank text without rewriting persisted content", () => {
    const parsed = mediaMetadataSchema.parse({
      kind: "article-image",
      alt: "  Orla dos Cavaleiros  ",
      caption: "  Movimento no início da manhã.  ",
      provenance: {
        origin: "own-production",
        creator: "  Maria Souza  ",
        credit: "  Foto: Maria Souza/Tudo Macaé  ",
        displayBasis: "own-production",
        acquiredAt: 1_777_000_000_000,
      },
    });

    expect(parsed.alt).toBe("  Orla dos Cavaleiros  ");
    expect(parsed.caption).toBe("  Movimento no início da manhã.  ");
    expect(parsed.provenance.creator).toBe("  Maria Souza  ");
    expect(parsed.provenance.credit).toBe("  Foto: Maria Souza/Tudo Macaé  ");
  });

  test("accepts own production only when origin and display basis are explicit", () => {
    const parsed = mediaMetadataSchema.parse({
      kind: "article-image",
      alt: "Orla dos Cavaleiros ao amanhecer",
      caption: "Movimento no início da manhã.",
      provenance: {
        origin: "own-production",
        creator: "Maria Souza",
        credit: "Foto: Maria Souza/Tudo Macaé",
        displayBasis: "own-production",
        acquiredAt: 1_777_000_000_000,
      },
    });

    expect(parsed.provenance).toEqual({
      origin: "own-production",
      creator: "Maria Souza",
      credit: "Foto: Maria Souza/Tudo Macaé",
      displayBasis: "own-production",
      acquiredAt: 1_777_000_000_000,
    });
    expect(() => mediaMetadataSchema.parse({
      ...parsed,
      provenance: "Arquivo do Tudo Macaé — produção própria",
    })).toThrow("Informe a origem estruturada da mídia.");
  });

  test.each([
    ["alt", metadata({ alt: "   " })],
    ["creator", metadata({ provenance: { ...ownProduction, creator: "   " } })],
    ["credit", metadata({ provenance: { ...ownProduction, credit: "   " } })],
  ])("refuses blank %s text", (_field, input) => {
    expect(() => mediaMetadataSchema.parse(input)).toThrow();
  });

  test.each([0, -1, 1.5])(
    "refuses a non-positive-integer acquisition epoch (%s)",
    (acquiredAt) => {
      expect(() => mediaMetadataSchema.parse(metadata({
        provenance: { ...ownProduction, acquiredAt },
      }))).toThrow();
    },
  );

  test("defaults an omitted caption without changing the required metadata", () => {
    expect(mediaMetadataSchema.parse(metadata())).toMatchObject({
      alt: "Orla dos Cavaleiros ao amanhecer",
      caption: "",
      provenance: ownProduction,
    });
  });

  test("does not infer a caption or replace attribution from an accessible description", () => {
    const parsed = mediaMetadataSchema.parse(metadata({ caption: "" }));
    expect(parsed.caption).toBe("");
    expect(parsed.alt).toBe("Orla dos Cavaleiros ao amanhecer");
    expect(parsed.provenance.credit).toBe(ownProduction.credit);
  });

  test("requires licence or opaque permission evidence for third-party Media", () => {
    const base = {
      kind: "article-image" as const,
      alt: "Fachada histórica",
      caption: "",
    };
    expect(() => mediaMetadataSchema.parse({
      ...base,
      provenance: {
        origin: "third-party",
        provider: "Arquivo Municipal",
        sourceUrl: "https://example.com/acervo/fachada",
        creator: "João da Silva",
        credit: "Foto: João da Silva",
        displayBasis: "license",
        acquiredAt: 1_777_000_000_000,
      },
    })).toThrow("Informe a origem estruturada da mídia.");
    expect(mediaMetadataSchema.parse({
      ...base,
      provenance: {
        origin: "third-party",
        provider: "Arquivo Municipal",
        creator: "João da Silva",
        credit: "Foto: João da Silva",
        displayBasis: "permission",
        permissionReference: "source-permission-123",
        acquiredAt: 1_777_000_000_000,
      },
    }).provenance).toMatchObject({
      displayBasis: "permission",
      permissionReference: "source-permission-123",
    });
  });

  test("accepts complete licensed provenance and refuses each missing right field", () => {
    const provenance = {
      origin: "third-party" as const,
      provider: "Arquivo Municipal",
      sourceUrl: "https://example.com/acervo/fachada",
      creator: "João da Silva",
      credit: "Foto: João da Silva",
      displayBasis: "license" as const,
      license: "CC BY 4.0",
      acquiredAt: 1_777_000_000_000,
    };
    expect(mediaMetadataSchema.parse(metadata({ provenance })).provenance)
      .toEqual(provenance);

    for (const field of ["provider", "license"] as const) {
      expect(() => mediaMetadataSchema.parse(metadata({
        provenance: { ...provenance, [field]: " " },
      }))).toThrow();
    }
  });

  test("identifies generated content without inferring third-party rights", () => {
    expect(mediaMetadataSchema.parse({
      kind: "article-image",
      alt: "Ilustração da orla",
      caption: "",
      provenance: {
        origin: "generated",
        creator: "OpenAI ImageGen",
        credit: "Imagem gerada por IA",
        displayBasis: "generated",
        acquiredAt: 1_777_000_000_000,
      },
    }).provenance).toMatchObject({
      origin: "generated",
      displayBasis: "generated",
    });
  });

  test("normalizes only identifiers at the update boundary", () => {
    const parsed = updateMediaMetadataSchema.parse({
      id: "  media-1  ",
      expectedRevision: 2,
      metadata: metadata({ caption: "  Legenda preservada.  " }),
      actorId: "  editor-1  ",
    });

    expect(parsed.id).toBe("media-1");
    expect(parsed.actorId).toBe("editor-1");
    expect(parsed.metadata.caption).toBe("  Legenda preservada.  ");
  });
});
