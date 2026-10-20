/**
 * Keeps Portuguese out of identifiers.
 *
 * The domain is thought and discussed in Portuguese; the code is written in
 * English. Context glossaries pair the canonical Portuguese and English names
 * — Pauta / Story, Matéria / Article, Procedência / Provenance, and so on.
 * `CONTEXT-MAP.md` owns that bilingual convention.
 *
 * That rule lived only in prose until agents started mixing the two languages
 * inside the same module, which is how you end up with `materiaId` next to
 * `articleTitle` and nobody sure which one the next person should copy. This
 * consistency tests compare those lines with the curated policy below. Runtime
 * linting reads only that static projection; it never parses editorial Markdown.
 *
 * Only identifiers are checked. Portuguese belongs in what a person reads or
 * types — interface copy, validation messages, URL paths — and all of that is
 * string literals, which this rule never looks at. The whole point is that
 * `z.string().min(1, "Selecione uma categoria")` stays exactly as it is while
 * `const categoriaId` does not.
 *
 * Matching is per camelCase segment rather than by substring, so the English
 * `material` is not caught by the Portuguese `materia`, and `mediaKind` is not
 * caught by anything — `media` is the English identifier we chose, and only the
 * Portuguese spelling `midia` is banned. Accents are stripped first, so
 * `matéria` and `materia` are the same word to the rule.
 *
 * Plurals are folded by removing a trailing `s`, including the `-ções` to
 * `-ção` spelling change. Other plural forms need explicit coverage.
 */

/** Glossary terms and discouraged synonyms that identifiers must not use. */
export const PORTUGUESE_IDENTIFIER_POLICY = Object.freeze([
  ["anuncio", "Ad"],
  ["anunciante", "advertiser"],
  ["negocio", "Business"],
  ["administrador", "Administrator"],
  ["interessado", "interestedParty"],
  ["categoria", "Category"],
  ["subcategoria", "Subcategory"],
  ["atuacao", "ActivityArea"],
  ["fonte", "Source"],
  ["captura", "Capture"],
  ["pauta", "Story"],
  ["editoria", "EditorialSection"],
  ["materia", "Article"],
  ["assunto", "Topic"],
  ["retificacao", "Correction"],
  ["rejeicao", "Rejection"],
  ["leitor", "reader"],
  ["cidadao", "Citizen"],
  ["usuario", "user"],
  ["perfil", "Profile"],
  ["midia", "Media"],
  ["ilustracao", "Illustration"],
  ["especie", "MediaKind"],
  ["procedencia", "provenance"],
  ["noticia", "Article"],
  ["redacao", "newsroom"],
  ["rechecagem", "recheckAt"],
  ["reivindicavel", "claimable"],
  ["denuncia", "Report"],
  ["moderacao", "Moderation"],
  ["conversa", "Conversation"],
  ["mensagem", "Message"],
  ["bloqueio", "Block"],
  ["arquivamento", "Archiving"],
]);

const BANNED = new Map(PORTUGUESE_IDENTIFIER_POLICY);

/** Drops diacritics so `matéria` and `materia` compare equal. */
function fold(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Splits an identifier into its word segments.
 *
 * Handles camelCase, PascalCase, snake_case and SCREAMING_SNAKE, plus the
 * acronym boundary in `HTTPServer` — without it, `HTTPServer` would arrive as
 * one segment and never match anything, which is harmless, but the same bug
 * would hide `URLDaMateria`.
 */
function segments(name) {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_$]+/)
    .filter(Boolean)
    .map(fold);
}

/** The banned term a segment stands for, or null. Folds supported plurals. */
function bannedTerm(segment) {
  if (BANNED.has(segment)) return segment;
  const singular = segment.endsWith("coes")
    ? `${segment.slice(0, -4)}cao`
    : segment.replace(/s$/, "");
  return BANNED.has(singular) ? singular : null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Identifiers are written in English; Portuguese belongs in user-facing strings.",
    },
    schema: [
      {
        type: "object",
        properties: {
          /** Extra identifier names to leave alone, matched whole. */
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      portuguese:
        "`{{name}}` carries the Portuguese term \"{{term}}\" in an identifier. Code is written in English — use `{{suggestion}}`. Context glossaries pair canonical Portuguese and English names.",
    },
  },

  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);

    function check(node, name) {
      if (typeof name !== "string" || allow.has(name)) return;

      for (const segment of segments(name)) {
        const term = bannedTerm(segment);
        if (!term) continue;

        context.report({
          node,
          messageId: "portuguese",
          data: { name, term, suggestion: BANNED.get(term) },
        });
        return;
      }
    }

    return {
      // Declarations only. A member read like `data.categoria` is a document
      // field this rule cannot rename on its own, and flagging the read while
      // the write lives in another file produces noise at the wrong site.
      VariableDeclarator: node => check(node.id, node.id.name),
      FunctionDeclaration: node => node.id && check(node.id, node.id.name),
      ClassDeclaration: node => node.id && check(node.id, node.id.name),
      TSInterfaceDeclaration: node => check(node.id, node.id.name),
      TSTypeAliasDeclaration: node => check(node.id, node.id.name),
      TSEnumDeclaration: node => check(node.id, node.id.name),
      TSPropertySignature: node =>
        node.key?.type === "Identifier" && check(node.key, node.key.name),
      PropertyDefinition: node =>
        node.key?.type === "Identifier" && check(node.key, node.key.name),
      Property: (node) => {
        if (node.computed || node.key?.type !== "Identifier") return;
        check(node.key, node.key.name);
      },
    };
  },
};

export default rule;
