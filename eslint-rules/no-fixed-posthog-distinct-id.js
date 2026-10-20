/**
 * Keeps PostHog from merging unrelated visitors into one invented person.
 *
 * A `distinct_id` written into the code (`"public-image-canary-production"`,
 * `` `service:${environment}` ``, `` `business:${id}` ``) is shared by every
 * request that reaches that line. PostHog treats it as one person: events
 * pile onto a single profile, become billable identified events, and
 * percentage rollouts stop meaning anything.
 *
 * Evaluation that has no real visitor sends `distinct_id: ""`; PostHog still
 * evaluates property and 0/100% conditions for it. Anything else must come
 * from an actual identity (the browser's anonymous id or the account uid).
 *
 * The value is fixed when it is any literal other than `""` (numbers,
 * booleans, `null` and `undefined` included), any unary expression, a template literal with
 * static text or a fixed interpolation, a `+` concatenation with a string, a
 * conditional or `??`/`||`/`&&` fallback reaching such a value, or a `const`
 * initialized with one. Other identifiers and calls are not followed:
 * the rule cannot know what they hold. Both object literals and later writes
 * (`body.distinct_id = …`, `body["distinct_id"] = …`, `body[key] = …` with a
 * `const key`) are checked. Static analysis stops there: a key or value built
 * at runtime, spread from another object or passed through a helper is left to
 * review and to OBSERVABILITY.md#posthog-identity.
 */

const KEY = "distinct_id";
const MAX_DEPTH = 4;

function staticName(key, computed, scope, depth = 0) {
  if (!key) return null;
  if (key.type === "Literal") return key.value;
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  if (key.type !== "Identifier") return null;
  if (!computed) return key.name;
  return depth < MAX_DEPTH ? staticName(constInitializer(key, scope), true, scope, depth + 1) : null;
}

function constInitializer(identifier, scope) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(identifier.name);
    if (!variable) continue;
    const [definition] = variable.defs;
    if (
      variable.defs.length === 1
      && definition.type === "Variable"
      && definition.parent.kind === "const"
      && definition.node.id.type === "Identifier"
    ) return definition.node.init;
    return null;
  }
  return null;
}

function declared(identifier, scope) {
  for (let current = scope; current; current = current.upper) {
    if (current.set.get(identifier.name)?.defs.length) return true;
  }
  return false;
}

// Child fields an expression may evaluate to: either side of `??`/`||`/`&&`,
// either branch of `? :`, and the wrapped value of a TypeScript assertion.
const VALUE_SOURCES = new Map([
  ["LogicalExpression", ["left", "right"]],
  ["ConditionalExpression", ["consequent", "alternate"]],
  ["TSAsExpression", ["expression"]],
  ["TSSatisfiesExpression", ["expression"]],
  ["TSNonNullExpression", ["expression"]],
  ["TSTypeAssertion", ["expression"]],
]);

function isFixedTemplate(node, scope, depth) {
  return node.quasis.some(quasi => (quasi.value.cooked ?? quasi.value.raw).length > 0)
    || node.expressions.some(expression => isFixed(expression, scope, depth + 1));
}

function isFixedConcatenation(node, scope, depth) {
  return node.operator === "+"
    && (isFixed(node.left, scope, depth + 1) || isFixed(node.right, scope, depth + 1));
}

function isFixedIdentifier(node, scope, depth) {
  // `JSON.stringify` drops an undefined field, and PostHog rejects the request.
  if (node.name === "undefined" && !declared(node, scope)) return true;
  return isFixed(constInitializer(node, scope), scope, depth + 1);
}

function isFixed(node, scope, depth = 0) {
  if (!node || depth > MAX_DEPTH) return false;
  const sources = VALUE_SOURCES.get(node.type);
  if (sources) return sources.some(field => isFixed(node[field], scope, depth + 1));
  switch (node.type) {
    case "Literal":
      return node.value !== "";
    case "TemplateLiteral":
      return isFixedTemplate(node, scope, depth);
    case "BinaryExpression":
      return isFixedConcatenation(node, scope, depth);
    case "Identifier":
      return isFixedIdentifier(node, scope, depth);
    case "UnaryExpression":
      // `-1`, `!id`, `typeof id` and `void 0` yield a number, boolean, type
      // name or undefined, never the caller's identity.
      return true;
    default:
      return false;
  }
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "PostHog `distinct_id` is empty or a real identity, never a value fixed in code.",
    },
    schema: [],
    messages: {
      fixed:
        "A `distinct_id` fixed in code makes every caller one PostHog person. Send `\"\"` when there is no real visitor, or pass the visitor's actual identity. See OBSERVABILITY.md#posthog-identity.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const check = (key, computed, value, node) => {
      const scope = sourceCode.getScope(node);
      if (staticName(key, computed, scope) === KEY && isFixed(value, scope)) {
        context.report({ node: value, messageId: "fixed" });
      }
    };
    return {
      Property(node) {
        if (node.parent.type === "ObjectExpression") check(node.key, node.computed, node.value, node);
      },
      AssignmentExpression(node) {
        if (node.left.type === "MemberExpression") {
          check(node.left.property, node.left.computed, node.right, node);
        }
      },
    };
  },
};

export default rule;
