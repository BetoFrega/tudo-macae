import local from "./eslint-rules/index.js";

// Playwright authoring conventions for `tests/**` (docs/agents/e2e-test-authoring.md).
export const playwrightConventions = [
  {
    files: ["tests/**/*"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "no-restricted-syntax": ["error", {
        // `this.click(...)` is BasePage's delegate to the same helper.
        selector:
          "CallExpression[callee.property.name='click']"
          + ":not([callee.object.type='ThisExpression'])",
        message:
          "Use click(locator) from tests/e2e/_helpers/click.ts — or this.click(...) "
          + "inside a POM — instead of Playwright's .click(). "
          + "It detects at runtime whether the target is an in-app link and waits "
          + "for the navigation to land — a click that arrives before hydration is "
          + "swallowed without navigating, and the failure surfaces much later.",
      }],
    },
  },
  {
    files: ["tests/e2e/_helpers/**/POMs/**/*.ts"],
    plugins: { local },
    rules: {
      "local/no-raw-playwright-page-selectors": [
        "error",
        { mode: "page-object" },
      ],
    },
  },
  {
    files: ["tests/**/*.spec.ts"],
    plugins: { local },
    rules: {
      "local/no-positional-playwright-locators": "error",
      "local/no-raw-playwright-page-selectors": ["error", { mode: "spec" }],
    },
  },
  {
    // The helper is the one place allowed to call Playwright's .click().
    files: ["tests/e2e/_helpers/click.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];
