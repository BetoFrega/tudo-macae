const POSITIONAL_METHODS = new Set(["first", "last", "nth"]);

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent specs from hiding duplicate actionable UI with positional locators.",
    },
    schema: [],
    messages: {
      positionalSelector:
        ".{{method}}() can hide duplicate actionable UI. Expose the collection "
        + "contract through a semantic Page Object method instead.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.computed) return;
        if (node.callee.property.type !== "Identifier") return;

        const method = node.callee.property.name;
        if (!POSITIONAL_METHODS.has(method)) return;

        context.report({ node, messageId: "positionalSelector", data: { method } });
      },
    };
  },
};

export default rule;
