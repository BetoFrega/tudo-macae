const TOKEN = /\bignoreStatic\b/g;

function isExecutableMutationConfig(path) {
  if (!path) return false;
  const normalized = path.replaceAll("\\", "/");

  return normalized === "package.json"
    || /(^|\/)stryker[^/]*\.config\.mjs$/.test(normalized)
    || /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(normalized);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `ignoreStatic`, which drops static mutants from mutation score.",
    },
    schema: [],
    messages: {
      forbidden:
        "Do not use ignoreStatic. The unit mutation tiers are already split by "
        + "runner environment so static mutants stay measured without the global "
        + "skip. Move expensive files to the right tier instead.",
    },
  },

  create(context) {
    if (!isExecutableMutationConfig(context.filename)) return {};

    const source = context.sourceCode.text;

    function check(node) {
      TOKEN.lastIndex = 0;
      if (!TOKEN.test(source)) return;
      context.report({ node, messageId: "forbidden" });
    }

    return {
      Program: check,
      Document: check,
      StyleSheet: check,
      root: check,
    };
  },
};

export default rule;
