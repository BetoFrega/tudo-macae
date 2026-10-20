const PAGE_SELECTOR_METHODS = new Set([
  "locator",
  "getByAltText",
  "getByLabel",
  "getByPlaceholder",
  "getByRole",
  "getByTestId",
  "getByText",
  "getByTitle",
]);

const ACTION_METHODS = new Set([
  "check",
  "clear",
  "click",
  "dblclick",
  "dispatchEvent",
  "dragTo",
  "fill",
  "focus",
  "hover",
  "press",
  "pressSequentially",
  "selectOption",
  "setChecked",
  "setInputFiles",
  "tap",
  "type",
  "uncheck",
]);

function memberName(node) {
  if (node.type !== "MemberExpression" || node.computed) return null;
  return node.property.type === "Identifier" ? node.property.name : null;
}

function isSpecPageReceiver(receiver, pageIdentifiers) {
  return receiver.type === "Identifier"
    && (pageIdentifiers.has(receiver.name) || /page$/i.test(receiver.name));
}

function isThisPage(receiver) {
  return receiver.type === "MemberExpression"
    && !receiver.computed
    && receiver.object.type === "ThisExpression"
    && receiver.property.type === "Identifier"
    && receiver.property.name === "page";
}

function isRawPageSelector(node, mode, pageIdentifiers) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") {
    return false;
  }

  const method = memberName(node.callee);
  if (!method || !PAGE_SELECTOR_METHODS.has(method)) return false;

  const receiver = node.callee.object;
  if (mode === "spec") return isSpecPageReceiver(receiver, pageIdentifiers);
  return isThisPage(receiver);
}

function unwrapAwait(node) {
  return node?.type === "AwaitExpression" ? node.argument : node;
}

function resolvesToPage(node, pageIdentifiers) {
  const value = unwrapAwait(node);
  if (!value) return false;
  if (value.type === "Identifier") return pageIdentifiers.has(value.name);
  if (value.type !== "CallExpression" || value.callee.type !== "MemberExpression") {
    return false;
  }

  const method = memberName(value.callee);
  if (method === "newPage") return true;
  return method === "waitForEvent"
    && value.arguments[0]?.type === "Literal"
    && value.arguments[0].value === "popup";
}

function expectationMatcher(expectCall) {
  let current = expectCall;
  while (current.parent) {
    const parent = current.parent;
    if (parent.type === "MemberExpression" && parent.object === current) {
      const name = memberName(parent);
      if (name?.startsWith("to")) return name;
      current = parent;
      continue;
    }
    break;
  }
  return null;
}

function memberCall(member) {
  const call = member.parent;
  return call?.type === "CallExpression" && call.callee === member ? call : null;
}

function isExpectedCount(parent, current) {
  return parent.type === "CallExpression"
    && parent.arguments.includes(current)
    && parent.callee.type === "Identifier"
    && parent.callee.name === "expect"
    && expectationMatcher(parent) === "toHaveCount";
}

function isMultiplicityInspection(selector) {
  let current = selector;

  while (current.parent) {
    const parent = current.parent;
    if (parent.type !== "MemberExpression" || parent.object !== current) {
      return isExpectedCount(parent, current);
    }

    const call = memberCall(parent);
    if (!call) {
      current = parent;
      continue;
    }
    const method = memberName(parent);
    if (method === "count") return true;
    if (method && ACTION_METHODS.has(method)) return false;
    current = call;
  }

  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep actionable Playwright selectors behind visible Page Object APIs.",
    },
    schema: [{
      type: "object",
      properties: {
        mode: { enum: ["page-object", "spec"] },
      },
      required: ["mode"],
      additionalProperties: false,
    }],
    messages: {
      rawPageObjectSelector:
        "Use the BasePage visible selector helper. Access this.page directly only "
        + "for metadata, deliberately hidden state, or DOM multiplicity checks, "
        + "with a justified local suppression.",
      rawActionableSelector:
        "Use a semantic Page Object API or pageObject(page). Raw page selectors "
        + "can match the hidden outgoing tree during navigation.",
    },
  },

  create(context) {
    const mode = context.options[0]?.mode;
    const pageIdentifiers = new Set(["page"]);
    return {
      VariableDeclarator(node) {
        if (
          mode === "spec"
          && node.id.type === "Identifier"
          && resolvesToPage(node.init, pageIdentifiers)
        ) {
          pageIdentifiers.add(node.id.name);
        }
      },
      AssignmentExpression(node) {
        if (
          mode === "spec"
          && node.left.type === "Identifier"
          && resolvesToPage(node.right, pageIdentifiers)
        ) {
          pageIdentifiers.add(node.left.name);
        }
      },
      CallExpression(node) {
        if (!isRawPageSelector(node, mode, pageIdentifiers)) return;
        if (mode === "spec" && isMultiplicityInspection(node)) return;

        context.report({
          node,
          messageId: mode === "spec"
            ? "rawActionableSelector"
            : "rawPageObjectSelector",
        });
      },
    };
  },
};

export default rule;
