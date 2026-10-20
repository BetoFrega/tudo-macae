/**
 * Routes every custom-claim write through one module.
 *
 * `auth.setCustomUserClaims(uid, claims)` does not merge. It replaces the whole
 * claims object. Granting one role with `{ editor: true }` silently erases an
 * `admin` the user already had, and the damage does not surface until someone
 * loses access to a screen they used yesterday — long after the commit that did
 * it.
 *
 * That is a landmine, not a rule: no amount of documentation survives an agent
 * writing the obvious two-word call. So the call gets one home, that home reads
 * the current claims and writes them back merged, and this rule makes every
 * other call site a build failure.
 *
 * The allow-list is configured in `eslint.config.mjs` and should name exactly
 * one module. If it ever names two, the merge logic has been copied and the
 * landmine is back.
 *
 * Three spellings reach the method, and all three are the same write:
 *
 *     auth.setCustomUserClaims(uid, claims)
 *     auth["setCustomUserClaims"](uid, claims)
 *     const { setCustomUserClaims } = auth
 *
 * A rule that only knows the first is worse than no rule, because it reads as
 * enforcement while leaving two ways round it — and the way round is what an
 * agent reaches for once the direct call errors.
 *
 * A name assembled at runtime (`auth[whichever]`) is not matched. Nothing here
 * can know what it holds, and guessing would cost false positives on code that
 * never touches claims.
 */

const METHOD = "setCustomUserClaims";

/**
 * The name a node refers to, or null when it is not statically knowable.
 *
 * `MemberExpression.property` and `Property.key` share these two spellings, so
 * both visitors below read them the same way.
 */
function staticName(node, computed) {
  if (computed) return node?.type === "Literal" ? node.value : null;
  return node?.type === "Identifier" ? node.name : null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Custom claims are written through the merging wrapper, never directly.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      raw:
        "`{{method}}` replaces the entire claims object, so calling it directly erases roles the user already has. Go through the wrapper that reads and merges first.",
    },
  },

  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const filename = (context.filename ?? context.getFilename()).replaceAll("\\", "/");

    if (allow.some(suffix => filename.endsWith(suffix))) return {};

    const report = node =>
      context.report({ node, messageId: "raw", data: { method: METHOD } });

    return {
      // `auth.setCustomUserClaims(...)` and `auth["setCustomUserClaims"](...)`.
      MemberExpression(node) {
        if (staticName(node.property, node.computed) === METHOD) report(node);
      },

      // `const { setCustomUserClaims } = auth`, renamed or not. Scoped to
      // ObjectPattern so that *defining* a property by that name — a stub in a
      // test, say — is left alone.
      "ObjectPattern > Property"(node) {
        if (staticName(node.key, node.computed) === METHOD) report(node);
      },
    };
  },
};

export default rule;
