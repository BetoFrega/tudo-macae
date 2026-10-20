/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Limit the UTF-8 size of a source file in bytes.",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: { type: "integer", minimum: 1 },
        },
        required: ["max"],
        additionalProperties: false,
      },
    ],
    messages: {
      tooLarge:
        "File has {{actual}} bytes. Maximum allowed is {{max}}. Split it into "
        + "smaller modules by responsibility.",
    },
  },

  create(context) {
    const { max } = context.options[0];

    return {
      Program(node) {
        const actual = Buffer.byteLength(context.sourceCode.text, "utf8");
        if (actual <= max) return;
        context.report({
          node,
          loc: { line: 1, column: 0 },
          messageId: "tooLarge",
          data: { actual, max },
        });
      },
    };
  },
};

export default rule;
