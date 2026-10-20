import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { glossaryCoverageEditorial } from "./no-portuguese-identifiers.coverage-editorial.js";
import { glossaryCoverageGeneral } from "./no-portuguese-identifiers.coverage-general.js";

const glossaryDirectory = resolve("docs/contexts");
export const glossaryEntries = readdirSync(glossaryDirectory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap((entry) => {
    const glossary = readFileSync(
      resolve(glossaryDirectory, entry.name, "CONTEXT.md"),
      "utf8",
    );
    return [...glossary.matchAll(
      /^\*\*(.+?) \/ (.+?)\*\*:\n([\s\S]*?)(?=^\*\*|(?![\s\S]))/gm,
    )].map(([, term, englishName, definition]) => ({
      definition,
      englishName,
      term,
    }));
  });

export const glossaryCoverage = [
  ...glossaryCoverageGeneral,
  ...glossaryCoverageEditorial,
];

export const generalEnglishSuggestionExceptions = {
  recheckAt: "The canonical concept is Recheck Date while the existing field remains recheckAt.",
  user: "General English replacement for the discouraged synonym usuário, not a modeled domain identifier.",
};
