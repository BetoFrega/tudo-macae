import { describe, expect, it } from "vitest";
import { PORTUGUESE_IDENTIFIER_POLICY } from "./no-portuguese-identifiers.js";
import {
  generalEnglishSuggestionExceptions,
  glossaryCoverage,
  glossaryEntries,
} from "./no-portuguese-identifiers.glossary-fixtures.js";

describe("domain glossary consistency", () => {
  it("declares bilingual canonical names for every glossary entry", () => {
    expect(
      glossaryEntries.filter(({ englishName, term }) =>
        !englishName.trim() || !term.trim(),
      ),
      "Every glossary entry needs canonical Portuguese and English names",
    ).toEqual([]);
  });

  it("records an enforcement or exclusion decision for every glossary entry", () => {
    const glossaryTerms = glossaryEntries.map(({ term }) => term).sort();

    expect(
      glossaryCoverage.map(({ glossaryTerm }) => glossaryTerm).sort(),
      "Glossary coverage decisions must match the canonical glossary exactly",
    ).toEqual(glossaryTerms);

    for (const decision of glossaryCoverage) {
      const decisionKinds = ["enforcedBy", "excludedBecause"].filter(kind =>
        Object.hasOwn(decision, kind),
      );
      expect(
        decisionKinds,
        `${decision.glossaryTerm} needs exactly one coverage decision`,
      ).toHaveLength(1);
      if (decision.enforcedBy) {
        expect(
          decision.enforcedBy,
          `${decision.glossaryTerm} needs at least one enforced lexical term`,
        ).not.toHaveLength(0);
      }
      else {
        expect(
          decision.excludedBecause?.trim(),
          `${decision.glossaryTerm} needs a concrete exclusion reason`,
        ).toBeTruthy();
      }
    }
  });

  it("keeps lexical mappings aligned with the explicit coverage decisions", () => {
    const expectedMappings = new Map();

    for (const { enforcedBy } of glossaryCoverage) {
      for (const [term, suggestion] of enforcedBy ?? []) {
        expect(
          expectedMappings.get(term) ?? suggestion,
          `${term} cannot have conflicting glossary suggestions`,
        ).toBe(suggestion);
        expectedMappings.set(term, suggestion);
      }
    }

    expect(
      new Map(PORTUGUESE_IDENTIFIER_POLICY),
      "The lint policy must match the enforced glossary projection",
    ).toEqual(expectedMappings);
  });

  it("grounds every banned term in a canonical term or discouraged synonym", () => {
    const portugueseWords = glossaryEntries.flatMap(({ definition, term }) => {
      const discouraged = definition.match(/^_Evitar_:\s*(.+)$/m)?.[1] ?? "";
      return `${term} ${discouraged}`.match(/\p{Letter}+/gu) ?? [];
    });
    const portugueseCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });
    const ungroundedTerms = PORTUGUESE_IDENTIFIER_POLICY.map(([term]) => term).filter(
      term => !portugueseWords.some(word => portugueseCollator.compare(word, term) === 0),
    );

    expect(
      ungroundedTerms,
      "Banned terms must come from a glossary term or `_Evitar_` synonym",
    ).toEqual([]);
  });

  it("keeps suggestions compatible with the authorized code vocabulary", () => {
    const entriesByTerm = new Map(
      glossaryEntries.map(entry => [entry.term, entry]),
    );
    const suggestionChecks = glossaryCoverage.flatMap(
      ({ enforcedBy = [], glossaryTerm }) => {
        const englishName = entriesByTerm.get(glossaryTerm)?.englishName ?? "";
        const words = englishName.split(/\s+/).filter(Boolean);
        const authorizedVocabulary = new Set([
          englishName,
          words.join(""),
          ...words,
        ].map(word => word.toLowerCase()));

        return enforcedBy.map(([term, suggestion]) => ({
          glossaryTerm,
          hasException: Object.hasOwn(
            generalEnglishSuggestionExceptions,
            suggestion,
          ),
          isAuthorized: authorizedVocabulary.has(suggestion.toLowerCase()),
          suggestion,
          term,
        }));
      },
    );
    const incompatibleSuggestions = suggestionChecks.filter(
      ({ hasException, isAuthorized }) => !isAuthorized && !hasException,
    );
    const usedExceptions = new Set(
      suggestionChecks
        .filter(({ hasException, isAuthorized }) => hasException && !isAuthorized)
        .map(({ suggestion }) => suggestion),
    );
    const unusedExceptions = Object.keys(generalEnglishSuggestionExceptions).filter(
      suggestion => !usedExceptions.has(suggestion),
    );
    const undocumentedExceptions = Object.entries(
      generalEnglishSuggestionExceptions,
    ).filter(([, reason]) => !reason.trim());

    expect(
      incompatibleSuggestions,
      "Suggestions need authorized glossary vocabulary or an explicit exception",
    ).toEqual([]);
    expect(
      unusedExceptions,
      "General-English suggestion exceptions must stay necessary",
    ).toEqual([]);
    expect(
      undocumentedExceptions,
      "General-English suggestion exceptions need a concrete reason",
    ).toEqual([]);
  });
});
