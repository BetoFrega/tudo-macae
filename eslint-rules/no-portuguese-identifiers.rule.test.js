import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "./no-portuguese-identifiers.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

const portugueseDiagnostic
  = "`{{name}}` carries the Portuguese term \"{{term}}\" in an identifier. Code is written in English — use `{{suggestion}}`. Context glossaries pair canonical Portuguese and English names.";

describe("rule contract", () => {
  it("preserves the metadata and allowed-name option schema", () => {
    expect(rule.meta).toEqual({
      docs: {
        description:
          "Identifiers are written in English; Portuguese belongs in user-facing strings.",
      },
      messages: { portuguese: portugueseDiagnostic },
      schema: [
        {
          additionalProperties: false,
          properties: {
            allow: { items: { type: "string" }, type: "array" },
          },
          type: "object",
        },
      ],
      type: "problem",
    });
  });
});

ruleTester.run("no-portuguese-identifiers", rule, {
  valid: [
    // The English identifiers from the routed context glossaries.
    "const article = 1;",
    "const citizenReporter = 1;",
    "const reporter = 1;",
    "const storyId = 'x';",
    "interface Capture { sourceId: string }",
    "type MediaKind = 'article-image';",
    "const illustration = 1;",
    "const provenance = 'Prefeitura de Macaé';",

    // `media` is the English word we chose; only `midia` is banned.
    "const mediaKind = 1;",
    "const media = [];",

    // Segment matching, not substring: these are English words that happen to
    // contain a banned term.
    "const material = 1;",
    "const fonteca = 1;",

    // Portuguese belongs in what a person reads. Never flagged.
    "const message = \"Selecione uma categoria\";",
    "const label = \"Ilustração editorial\";",
    "const path = \"/anuncio/123\";",
    "throw new Error(\"Anúncio não encontrado\");",

    // Reads of a field this file does not own are somebody else's problem.
    "const value = data.categoria;",

    // Destructuring patterns have no identifier name for the declaration rule.
    "const [value] = data;",

    // Anonymous declarations and computed keys do not declare a name to check.
    "export default class {}",
    "const record = { [materia]: 'x' };",

    { code: "const materia = 1;", options: [{ allow: ["materia"] }] },
  ],

  invalid: [
    {
      code: "const cidadaoReporter = 1;",
      errors: [{
        messageId: "portuguese",
        data: { name: "cidadaoReporter", term: "cidadao", suggestion: "Citizen" },
      }],
    },
    {
      code: "const cidadãoId = 1;",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "const cidadãos = [];",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "const ilustracao = 1;",
      errors: [
        {
          message: portugueseDiagnostic
            .replace("{{name}}", "ilustracao")
            .replace("{{term}}", "ilustracao")
            .replace("{{suggestion}}", "Illustration"),
        },
      ],
    },
    {
      code: "const materiaId = 1;",
      errors: [
        {
          message: portugueseDiagnostic
            .replace("{{name}}", "materiaId")
            .replace("{{term}}", "materia")
            .replace("{{suggestion}}", "Article"),
        },
      ],
    },
    {
      // Accents folded before comparing.
      code: "const matéria = 1;",
      errors: [{ messageId: "portuguese" }],
    },
    {
      // Plural folded too.
      code: "function listarPautas() {}",
      errors: [{ messageId: "portuguese" }],
    },
    {
      // A simple plural folds by removing the trailing `s`.
      code: "function listarAssuntos() {}",
      errors: [{ messageId: "portuguese" }],
    },
    {
      // The -ções plural needs its singular -ção ending after accent folding.
      code: "const moderacoesPendentes = [];",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "const moderaçõesPendentes = [];",
      errors: [{ messageId: "portuguese" }],
    },
    {
      // Acronym boundaries stay separate from the following Portuguese word.
      code: "function URLDaMateria() {}",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "const midiaId = 1;",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "interface Anuncio { title: string }",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "class Materia {}",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "enum EstadoDaMateria { Draft }",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "class Story { materia = '' }",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "type EspecieDeMidia = string;",
      // One report per identifier, not one per offending segment.
      errors: 1,
    },
    {
      code: "const record = { procedencia: 'x' };",
      errors: [{ messageId: "portuguese" }],
    },
    {
      code: "interface Story { dataDaMateria: number }",
      errors: [{ messageId: "portuguese" }],
    },
    {
      // SCREAMING_SNAKE splits on the underscore.
      code: "const MAX_ANUNCIOS = 3;",
      errors: [{ messageId: "portuguese" }],
    },
  ],
});
